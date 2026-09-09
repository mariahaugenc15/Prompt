import { PromptLogo } from './PromptLogo'

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-center border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur">
      <PromptLogo size={19} />
    </header>
  )
}
