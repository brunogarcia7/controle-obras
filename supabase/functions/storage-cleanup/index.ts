import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'comprovantes';
const TABLE = 'locacoes';
const PAGE_SIZE = 1000;

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }
    });
}

function extractPath(reference: unknown): string | null {
    const value = String(reference ?? '').trim();
    if (!value) return null;

    if (!/^https?:\/\//i.test(value)) {
        return value.startsWith(`${BUCKET}/`)
            ? value.slice(BUCKET.length + 1)
            : value.replace(/^\/+/, '');
    }

    try {
        const url = new URL(value);
        const markers = [
            `/storage/v1/object/public/${BUCKET}/`,
            `/storage/v1/object/sign/${BUCKET}/`,
            `/storage/v1/object/authenticated/${BUCKET}/`
        ];

        for (const marker of markers) {
            const index = url.pathname.indexOf(marker);
            if (index >= 0) {
                const encoded = url.pathname.slice(index + marker.length);
                try {
                    return decodeURIComponent(encoded);
                } catch {
                    return encoded;
                }
            }
        }
    } catch {
        return null;
    }

    return null;
}

async function loadReferencedPaths(supabase: ReturnType<typeof createClient>) {
    const paths = new Set<string>();
    let offset = 0;

    while (true) {
        const { data, error } = await supabase
            .from(TABLE)
            .select('anexo')
            .not('anexo', 'is', null)
            .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;

        for (const row of data ?? []) {
            const path = extractPath(row.anexo);
            if (path) paths.add(path);
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return paths;
}

async function listPrefix(
    supabase: ReturnType<typeof createClient>,
    prefix: string,
    output: string[]
) {
    let offset = 0;

    while (true) {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .list(prefix, {
                limit: PAGE_SIZE,
                offset,
                sortBy: { column: 'name', order: 'asc' }
            });

        if (error) throw error;

        for (const item of data ?? []) {
            const path = prefix ? `${prefix}/${item.name}` : item.name;
            const isFolder = !item.id && !item.metadata;

            if (isFolder) {
                await listPrefix(supabase, path, output);
            } else {
                output.push(path);
            }
        }

        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }
}

async function removeInBatches(
    supabase: ReturnType<typeof createClient>,
    paths: string[]
) {
    let removed = 0;

    for (let index = 0; index < paths.length; index += PAGE_SIZE) {
        const batch = paths.slice(index, index + PAGE_SIZE);
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .remove(batch);

        if (error) throw error;
        removed += data?.length ?? batch.length;
    }

    return removed;
}

Deno.serve(async (request) => {
    if (request.method !== 'POST') {
        return json(405, { error: 'Use POST.' });
    }

    const expectedToken = Deno.env.get('STORAGE_MAINTENANCE_TOKEN') ?? '';
    const providedToken = request.headers.get('x-maintenance-token') ?? '';

    if (expectedToken.length < 32) {
        return json(500, {
            error: 'STORAGE_MAINTENANCE_TOKEN ausente ou muito curto.'
        });
    }

    if (providedToken !== expectedToken) {
        return json(401, { error: 'Token de manutencao invalido.' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
        return json(500, {
            error: 'Variaveis SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY indisponiveis.'
        });
    }

    let body: Record<string, unknown> = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    const execute = body.confirm === 'DELETE_ORPHANS';
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        const referenced = await loadReferencedPaths(supabase);
        const objects: string[] = [];
        await listPrefix(supabase, '', objects);

        const orphans = objects.filter((path) => !referenced.has(path));
        let removed = 0;

        if (execute && orphans.length > 0) {
            removed = await removeInBatches(supabase, orphans);
        }

        return json(200, {
            mode: execute ? 'execute' : 'dry-run',
            bucket: BUCKET,
            databaseReferences: referenced.size,
            storageObjects: objects.length,
            orphanObjects: orphans.length,
            removed,
            preview: orphans.slice(0, 200),
            note: execute
                ? 'Objetos orfaos removidos pela Storage API.'
                : 'Nada foi apagado. Envie {"confirm":"DELETE_ORPHANS"} para executar.'
        });
    } catch (error) {
        console.error('[storage-cleanup]', error);
        return json(500, {
            error: error instanceof Error ? error.message : String(error)
        });
    }
});
