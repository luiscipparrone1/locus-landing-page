import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { hero } from "@/content/hero"

// The footage layer and the motion wrappers are irrelevant to the copy and
// pull in video/IntersectionObserver APIs jsdom lacks.
vi.mock("./hero-background", () => ({ HeroBackground: () => null }))
vi.mock("@/components/motion", () => ({
  BreathingDot: () => null,
  SpringReveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock("@/components/ui/magnetic-button", () => ({
  MagneticButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import { Hero } from "./hero"

describe("<Hero />", () => {
  afterEach(cleanup)

  it("keeps the space between the subheadline sentences (fused as 'day.Learn' on phones before 2026-09-08)", () => {
    render(<Hero />)
    // The <br> is hidden below `sm`, so the text nodes on either side of it
    // must carry the space themselves.
    const paragraph = screen.getByText(/whole day\./).closest("p")
    expect(paragraph?.textContent).toBe(hero.subheadline)
    expect(paragraph?.textContent).not.toMatch(/day\.Learn/)
  })
})
