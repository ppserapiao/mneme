import { Architecture } from '@/components/Architecture'
import { Benchmark } from '@/components/Benchmark'
import { Footer } from '@/components/Footer'
import { Hero } from '@/components/Hero'
import { HeroDescription } from '@/components/HeroDescription'
import { Install } from '@/components/Install'
import { Nav } from '@/components/Nav'
import { PullQuote } from '@/components/PullQuote'
import { Thesis } from '@/components/Thesis'

export default function Page() {
  return (
    <>
      <Nav />
      <main className="page">
        <Hero />
        <HeroDescription />
        <Thesis />
        <PullQuote />
        <Benchmark />
        <Install />
        <Architecture />
      </main>
      <Footer />
    </>
  )
}
