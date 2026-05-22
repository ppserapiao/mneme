import { ArchitectureField } from '@/components/editorial/ArchitectureField'
import { Colophon } from '@/components/editorial/Colophon'
import { Cover } from '@/components/editorial/Cover'
import { EditorialNav } from '@/components/editorial/EditorialNav'
import { EvidenceTable } from '@/components/editorial/EvidenceTable'
import { InstallSpec } from '@/components/editorial/InstallSpec'
import { Lede } from '@/components/editorial/Lede'
import { PullQuoteBig } from '@/components/editorial/PullQuoteBig'
import { SidebarNav } from '@/components/editorial/SidebarNav'
import { ThesisEssay } from '@/components/editorial/ThesisEssay'

export default function Page() {
  return (
    <>
      <EditorialNav />
      <SidebarNav />
      <main className="editorial-page">
        <Cover />
        <Lede />
        <EvidenceTable />
        <ThesisEssay />
        <ArchitectureField />
        <InstallSpec />
        <PullQuoteBig />
      </main>
      <Colophon />
    </>
  )
}
