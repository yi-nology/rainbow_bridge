import { AppSidebar } from "@/components/app-sidebar"
import { ProjectIntro } from "@/components/project-intro"
import { ApiDocs } from "@/components/api-docs"
import { RuntimeConfig } from "@/components/runtime-config"

export default function HomePage() {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">项目概览</h1>
            <p className="text-muted-foreground mt-1">
              虹桥计划 · 前端资源配置中台
            </p>
          </div>

          <ProjectIntro />
          <ApiDocs />
          <RuntimeConfig />
        </div>
      </main>
    </div>
  )
}
