import Link from "next/link"
import { Fragment } from "react"

import { PageShell } from "@/components/layout/page-shell"
import { BreathingDot, SpringReveal } from "@/components/motion"
import { buttonVariants } from "@/components/ui/button"
import { MagneticButton } from "@/components/ui/magnetic-button"
import { hero, heroSubheadlineLines } from "@/content/hero"
import { cn } from "@/lib/utils"

import { HeroBackground } from "./hero-background"

export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate"
    >
      {/* Stage one — viewport-filling headline over the glacier footage.
          Mobile composition (2026-08-17): the copy is top-aligned under the
          nav so the lower third stays clear for the penguin — the footage's
          one moving subject walks at ~66% of the frame, and centred copy sat
          right on top of it. From md up the copy re-centres in the text rail. */}
      <div className="relative flex min-h-[100dvh] items-start md:items-center overflow-hidden">
        <HeroBackground />

        <PageShell className="relative pt-28 pb-16 md:pt-32 md:pb-20">
          <div className="grid grid-cols-1 gap-y-12 md:grid-cols-12 md:gap-x-10">
            {/* Mobile ink (2026-08-17): below md the copy sits directly on the
                full-bleed footage, so eyebrow + subheadline drop the muted
                tone for full navy and the headline/paragraph carry a soft
                canvas-coloured glow. From md up the text rail is on canvas
                and the muted hierarchy returns. */}
            <SpringReveal className="md:col-span-7 lg:col-span-6 flex flex-col items-start gap-6">
              <span className="inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--fg)]/80 md:text-[var(--muted-foreground)]">
                <BreathingDot aria-hidden />
                <span>AI-native execution OS</span>
              </span>
              <h1
                id="hero-heading"
                className="text-balance text-left text-[2.5rem] font-semibold leading-[1] tracking-[-0.035em] text-[var(--fg)] max-md:[text-shadow:0_1px_2px_rgb(236_241_248/0.6),0_0_28px_rgb(236_241_248/0.9)] sm:text-[3rem] md:text-[3.5rem] lg:text-[3.875rem] xl:text-[4.125rem]"
              >
                {hero.headline}
                <span className="block">{hero.headlineTail}</span>
              </h1>
              <p className="max-w-xl text-pretty text-left text-[15px] leading-relaxed text-[var(--fg)]/88 max-md:[text-shadow:0_0_20px_rgb(236_241_248/0.9)] md:text-base md:text-[var(--muted-foreground)]">
                {/* One sentence per line from sm up (Luis, 2026-09-02): the two
                    sentences are close in length, so breaking at the full stop
                    gives two balanced lines instead of a ragged wrap. */}
                {heroSubheadlineLines.map((line, i) => (
                  <Fragment key={line}>
                    {/* The split ate the inter-sentence space; put it back so
                        the sentences don't fuse ("day.Learn") below `sm`,
                        where the <br> is hidden. From `sm` up the space
                        collapses against the forced break. */}
                    {i > 0 && " "}
                    {i > 0 && <br className="max-sm:hidden" />}
                    {line}
                  </Fragment>
                ))}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <MagneticButton href={hero.primaryCta.href}>
                  <span
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                    )}
                  >
                    {hero.primaryCta.label}
                  </span>
                </MagneticButton>
                <Link
                  href={hero.secondaryCta.href}
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  {hero.secondaryCta.label}
                </Link>
              </div>
            </SpringReveal>
          </div>
        </PageShell>

        {/* Bottom-right mono cue — pure type, no fill. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 md:bottom-8">
          <PageShell className="flex items-end justify-end">
            <span className="hidden md:inline font-mono text-[10.5px] uppercase tracking-[0.24em] text-[var(--muted-foreground)]/55">
              Scroll &darr;
            </span>
          </PageShell>
        </div>
      </div>
    </section>
  )
}
