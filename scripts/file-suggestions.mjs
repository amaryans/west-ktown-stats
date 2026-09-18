#!/usr/bin/env node
/**
 * Files each "new" stat suggestion from Supabase as a GitHub issue and marks
 * the row as filed. Runs in GitHub Actions (see
 * .github/workflows/file-stat-suggestions.yml) or locally:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GITHUB_TOKEN=... \
 *   GITHUB_REPOSITORY=owner/repo npm run file-suggestions
 *
 * Uses only fetch: the service-role key bypasses row security, so it must
 * never ship to the browser. Idempotent: rows are updated to 'filed' with the
 * issue number, so re-running never files a suggestion twice.
 */
import { createClient } from '@supabase/supabase-js'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env

function need(name, value) {
  if (!value) {
    console.error(`Missing ${name}`)
    process.exit(1)
  }
  return value
}

const supabaseUrl = need('SUPABASE_URL', SUPABASE_URL)
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY)
const token = need('GITHUB_TOKEN', GITHUB_TOKEN)
const repo = need('GITHUB_REPOSITORY', GITHUB_REPOSITORY)

const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

async function githubRequest(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${path}: ${await res.text()}`)
  }
  return res.json()
}

async function ensureLabel() {
  try {
    await githubRequest(`/repos/${repo}/labels/stat-suggestion`)
  } catch {
    await githubRequest(`/repos/${repo}/labels`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'stat-suggestion',
        color: '0ea5e9',
        description: 'Suggested from the Stats tab on the league site',
      }),
    }).catch(() => undefined)
  }
}

function issueBody(suggestion, author) {
  const lines = [
    suggestion.description?.trim() || '_No further description._',
    '',
    '---',
    `Suggested by **${author}** on the league site (Stats → Suggest a stat) at ${suggestion.created_at}.`,
    `Suggestion id: \`${suggestion.id}\``,
  ]
  return lines.join('\n')
}

async function main() {
  const { data: rows, error } = await supabase
    .from('stat_suggestions')
    .select('*')
    .eq('status', 'new')
    .order('created_at')
  if (error) throw error
  if (!rows.length) {
    console.log('No new suggestions to file.')
    return
  }

  const { data: profiles } = await supabase.from('profiles').select('id, display_name')
  const nameOf = (id) => profiles?.find((p) => p.id === id)?.display_name ?? 'a league member'

  await ensureLabel()
  let filed = 0
  for (const suggestion of rows) {
    const issue = await githubRequest(`/repos/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `Stat request: ${suggestion.title}`,
        body: issueBody(suggestion, nameOf(suggestion.user_id)),
        labels: ['stat-suggestion'],
      }),
    })
    const { error: updateError } = await supabase
      .from('stat_suggestions')
      .update({
        status: 'filed',
        issue_number: issue.number,
        issue_url: issue.html_url,
        filed_at: new Date().toISOString(),
      })
      .eq('id', suggestion.id)
    if (updateError) throw updateError
    console.log(`Filed #${issue.number}: ${suggestion.title}`)
    filed += 1
  }
  console.log(`Filed ${filed} suggestion${filed === 1 ? '' : 's'}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
