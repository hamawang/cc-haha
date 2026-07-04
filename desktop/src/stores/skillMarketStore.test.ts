import { beforeEach, describe, expect, it, vi } from 'vitest'
import { skillMarketApi } from '../api/skillMarket'
import type { SkillMarketDetail, SkillMarketItem } from '../types/skillMarket'
import { useSkillMarketStore } from './skillMarketStore'

vi.mock('../api/skillMarket', () => ({
  skillMarketApi: {
    list: vi.fn(),
    detail: vi.fn(),
    install: vi.fn(),
  },
}))

const mockedSkillMarketApi = vi.mocked(skillMarketApi)

function makeItem(overrides: Partial<SkillMarketItem> = {}): SkillMarketItem {
  return {
    source: 'clawhub',
    sourceMode: 'primary',
    slug: 'skill-vetter',
    displayName: 'Skill Vetter',
    summary: 'Security-first skill vetting.',
    canonicalUrl: 'https://clawhub.ai/skill-vetter',
    trustState: 'clean',
    installed: false,
    ...overrides,
  }
}

function makeDetail(overrides: Partial<SkillMarketDetail> = {}): SkillMarketDetail {
  return {
    ...makeItem(),
    files: [],
    riskLabels: [],
    installEligibility: { status: 'installable' },
    ...overrides,
  }
}

describe('skillMarketStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSkillMarketStore.setState({
      items: [],
      nextCursor: null,
      selectedDetail: null,
      source: 'auto',
      resolvedSource: null,
      sourceStatus: null,
      statusMessage: null,
      sort: 'downloads',
      query: '',
      isLoading: false,
      isLoadingMore: false,
      isDetailLoading: false,
      isInstalling: false,
      error: null,
    })
  })

  it('loads marketplace items with trimmed query parameters', async () => {
    const item = makeItem()
    mockedSkillMarketApi.list.mockResolvedValue({
      items: [item],
      nextCursor: null,
      source: 'clawhub',
      sourceStatus: 'ok',
    })
    useSkillMarketStore.setState({
      source: 'skillhub',
      sort: 'trending',
      query: '  vetter  ',
    })

    await useSkillMarketStore.getState().fetchItems()

    expect(mockedSkillMarketApi.list).toHaveBeenCalledWith({
      source: 'skillhub',
      sort: 'trending',
      q: 'vetter',
      limit: 100,
    })
    expect(useSkillMarketStore.getState().items).toEqual([item])
    expect(useSkillMarketStore.getState().nextCursor).toBeNull()
    expect(useSkillMarketStore.getState().resolvedSource).toBe('clawhub')
    expect(useSkillMarketStore.getState().sourceStatus).toBe('ok')
    expect(useSkillMarketStore.getState().statusMessage).toBeNull()
    expect(useSkillMarketStore.getState().isLoading).toBe(false)
    expect(useSkillMarketStore.getState().error).toBeNull()
  })

  it('allows callers to override the current query for an immediate refresh', async () => {
    mockedSkillMarketApi.list.mockResolvedValue({
      items: [],
      nextCursor: null,
      source: 'clawhub',
      sourceStatus: 'ok',
    })
    useSkillMarketStore.setState({ query: 'weather' })

    await useSkillMarketStore.getState().fetchItems({ query: '' })

    expect(mockedSkillMarketApi.list).toHaveBeenCalledWith({
      source: 'auto',
      sort: 'downloads',
      q: undefined,
      limit: 100,
    })
  })

  it('keeps the resolved fallback source status from the marketplace API', async () => {
    const item = makeItem({ source: 'skillhub', sourceMode: 'fallback' })
    mockedSkillMarketApi.list.mockResolvedValue({
      items: [item],
      nextCursor: null,
      source: 'skillhub',
      sourceStatus: 'fallback',
      message: 'ClawHub unavailable, using SkillHub.',
    })

    await useSkillMarketStore.getState().fetchItems()

    expect(useSkillMarketStore.getState().items).toEqual([item])
    expect(useSkillMarketStore.getState().resolvedSource).toBe('skillhub')
    expect(useSkillMarketStore.getState().sourceStatus).toBe('fallback')
    expect(useSkillMarketStore.getState().statusMessage).toBe('ClawHub unavailable, using SkillHub.')
  })

  it('loads additional marketplace pages without duplicating existing skills', async () => {
    const first = makeItem({ slug: 'skill-vetter', displayName: 'Skill Vetter' })
    const duplicate = makeItem({ slug: 'skill-vetter', displayName: 'Skill Vetter Updated' })
    const second = makeItem({ slug: 'ppt-generator', displayName: 'PPT Generator' })
    mockedSkillMarketApi.list
      .mockResolvedValueOnce({
        items: [first],
        nextCursor: 'page-2',
        source: 'clawhub',
        sourceStatus: 'ok',
      })
      .mockResolvedValueOnce({
        items: [duplicate, second],
        nextCursor: null,
        source: 'clawhub',
        sourceStatus: 'ok',
      })

    await useSkillMarketStore.getState().fetchItems()
    await useSkillMarketStore.getState().fetchMore()

    expect(mockedSkillMarketApi.list).toHaveBeenLastCalledWith({
      source: 'auto',
      sort: 'downloads',
      q: undefined,
      cursor: 'page-2',
      limit: 100,
    })
    expect(useSkillMarketStore.getState().items).toEqual([first, second])
    expect(useSkillMarketStore.getState().nextCursor).toBeNull()
    expect(useSkillMarketStore.getState().isLoadingMore).toBe(false)
  })

  it('sets an error when loading marketplace items fails', async () => {
    mockedSkillMarketApi.list.mockRejectedValue(new Error('market unavailable'))

    await useSkillMarketStore.getState().fetchItems()

    expect(useSkillMarketStore.getState().items).toEqual([])
    expect(useSkillMarketStore.getState().isLoading).toBe(false)
    expect(useSkillMarketStore.getState().error).toBe('market unavailable')
  })

  it('updates source, sort, and query filters', () => {
    useSkillMarketStore.setState({ selectedDetail: makeDetail() })

    useSkillMarketStore.getState().setSource('clawhub')
    expect(useSkillMarketStore.getState().selectedDetail).toBeNull()

    useSkillMarketStore.setState({ selectedDetail: makeDetail() })
    useSkillMarketStore.getState().setSort('updated')
    useSkillMarketStore.getState().setQuery('security')

    expect(useSkillMarketStore.getState().source).toBe('clawhub')
    expect(useSkillMarketStore.getState().sort).toBe('updated')
    expect(useSkillMarketStore.getState().query).toBe('security')
    expect(useSkillMarketStore.getState().selectedDetail).toBeNull()
  })

  it('loads selected marketplace detail', async () => {
    const detail = makeDetail()
    mockedSkillMarketApi.detail.mockResolvedValue({ detail })

    await useSkillMarketStore.getState().fetchDetail('clawhub', 'skill-vetter')

    expect(mockedSkillMarketApi.detail).toHaveBeenCalledWith('clawhub', 'skill-vetter')
    expect(useSkillMarketStore.getState().selectedDetail).toEqual(detail)
    expect(useSkillMarketStore.getState().isDetailLoading).toBe(false)
    expect(useSkillMarketStore.getState().error).toBeNull()
  })

  it('ignores stale marketplace detail responses', async () => {
    let resolveFirst: ((value: { detail: SkillMarketDetail }) => void) | undefined
    let resolveSecond: ((value: { detail: SkillMarketDetail }) => void) | undefined
    const first = makeDetail({ slug: 'first-skill', displayName: 'First Skill' })
    const second = makeDetail({
      source: 'skillhub',
      slug: 'second-skill',
      displayName: 'Second Skill',
    })
    mockedSkillMarketApi.detail
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecond = resolve }))

    const firstRequest = useSkillMarketStore.getState().fetchDetail('clawhub', 'first-skill')
    const secondRequest = useSkillMarketStore.getState().fetchDetail('skillhub', 'second-skill')

    resolveSecond?.({ detail: second })
    await secondRequest
    expect(useSkillMarketStore.getState().selectedDetail).toEqual(second)

    resolveFirst?.({ detail: first })
    await firstRequest
    expect(useSkillMarketStore.getState().selectedDetail).toEqual(second)
  })

  it('installs selected detail and refreshes the list and detail', async () => {
    const selected = makeDetail({ version: '1.0.0' })
    const refreshed = makeDetail({
      installed: true,
      installEligibility: { status: 'installed', installedSkillName: 'skill-vetter' },
    })
    mockedSkillMarketApi.install.mockResolvedValue({
      installed: true,
      skillName: 'skill-vetter',
      targetPath: '/Users/nanmi/.claude/skills/skill-vetter',
    })
    mockedSkillMarketApi.list.mockResolvedValue({
      items: [makeItem({ installed: true })],
      nextCursor: null,
      source: 'clawhub',
      sourceStatus: 'ok',
    })
    mockedSkillMarketApi.detail.mockResolvedValue({ detail: refreshed })
    useSkillMarketStore.setState({ selectedDetail: selected })

    await useSkillMarketStore.getState().installSelected()

    expect(mockedSkillMarketApi.install).toHaveBeenCalledWith('clawhub', 'skill-vetter', '1.0.0')
    expect(mockedSkillMarketApi.list).toHaveBeenCalledWith({
      source: 'auto',
      sort: 'downloads',
      q: undefined,
      limit: 100,
    })
    expect(mockedSkillMarketApi.detail).toHaveBeenCalledWith('clawhub', 'skill-vetter')
    expect(useSkillMarketStore.getState().selectedDetail).toEqual(refreshed)
    expect(useSkillMarketStore.getState().isInstalling).toBe(false)
  })

  it('does not call install APIs when no detail is selected', async () => {
    await useSkillMarketStore.getState().installSelected()

    expect(mockedSkillMarketApi.install).not.toHaveBeenCalled()
    expect(mockedSkillMarketApi.list).not.toHaveBeenCalled()
    expect(mockedSkillMarketApi.detail).not.toHaveBeenCalled()
    expect(useSkillMarketStore.getState().isInstalling).toBe(false)
  })

  it('sets an error when installing selected detail fails', async () => {
    useSkillMarketStore.setState({ selectedDetail: makeDetail() })
    mockedSkillMarketApi.install.mockRejectedValue(new Error('install failed'))

    await useSkillMarketStore.getState().installSelected()

    expect(mockedSkillMarketApi.install).toHaveBeenCalledWith('clawhub', 'skill-vetter', undefined)
    expect(mockedSkillMarketApi.list).not.toHaveBeenCalled()
    expect(mockedSkillMarketApi.detail).not.toHaveBeenCalled()
    expect(useSkillMarketStore.getState().isInstalling).toBe(false)
    expect(useSkillMarketStore.getState().error).toBe('install failed')
  })
})
