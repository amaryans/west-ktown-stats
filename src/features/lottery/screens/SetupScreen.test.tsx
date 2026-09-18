import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetupScreen from './SetupScreen.tsx'
import { useAppStore } from '../state/store.ts'
import { SleeperApiError } from '../data/sleeper/client.ts'

vi.mock('../data/sleeper/client.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../data/sleeper/client.ts')>()
  return {
    ...original,
    getLeagueBundle: vi.fn(),
    getUserByName: vi.fn(),
    getUserLeagues: vi.fn(),
  }
})

import { getLeagueBundle } from '../data/sleeper/client.ts'

beforeEach(() => {
  localStorage.clear()
  useAppStore.getState().startOver()
  vi.clearAllMocks()
})

describe('SetupScreen', () => {
  test('shows both setup paths', () => {
    render(<SetupScreen />)
    expect(screen.getByRole('heading', { name: /import from sleeper/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /manual setup/i })).toBeInTheDocument()
  })

  test('invalid league id shows a friendly error', async () => {
    vi.mocked(getLeagueBundle).mockRejectedValue(
      new SleeperApiError('League not found — double-check the league ID', 404, ''),
    )
    const user = userEvent.setup()
    render(<SetupScreen />)

    await user.type(screen.getByLabelText(/sleeper league id/i), '12345678')
    await user.click(screen.getByRole('button', { name: /import league/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/league not found/i)
    expect(useAppStore.getState().phase).toBe('setup')
  })

  test('manual setup creates a league and advances to review', async () => {
    const user = userEvent.setup()
    render(<SetupScreen />)

    await user.type(screen.getByLabelText(/league name/i), 'Backyard League')
    await user.selectOptions(screen.getByLabelText(/number of teams/i), '8')
    await user.click(screen.getByRole('button', { name: /create league/i }))

    const state = useAppStore.getState()
    expect(state.phase).toBe('review')
    expect(state.league?.name).toBe('Backyard League')
    expect(state.league?.teams).toHaveLength(8)
    expect(state.league?.source).toBe('manual')
  })

  test('sample league loads without any network calls', async () => {
    const user = userEvent.setup()
    render(<SetupScreen />)

    await user.click(screen.getByRole('button', { name: /sample league/i }))

    const state = useAppStore.getState()
    expect(state.phase).toBe('review')
    expect(state.league?.teams).toHaveLength(12)
    expect(getLeagueBundle).not.toHaveBeenCalled()
  })
})
