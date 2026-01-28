"use client"

import React, { useState, useCallback, useMemo } from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type {
  ExportTreeEnvironment,
  ExportTreePipeline,
  ExportTreeConfig,
  ExportSelection,
  ImportPreviewEnvironment,
  ImportPreviewPipeline,
  ImportPreviewConfig,
} from "@/lib/api/transfer"

// ==================== Export Tree Select ====================

interface ExportTreeSelectProps {
  data: ExportTreeEnvironment[]
  onChange: (selections: ExportSelection[]) => void
  loading?: boolean
}

interface CheckedState {
  environments: Set<string>
  pipelines: Set<string>  // key: env_key:pipe_key
  configs: Set<string>    // key: env_key:pipe_key:resource_key
}

export function ExportTreeSelect({ data, onChange, loading }: ExportTreeSelectProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<CheckedState>({
    environments: new Set(),
    pipelines: new Set(),
    configs: new Set(),
  })

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Calculate selections from checked state
  const calculateSelections = useCallback((newChecked: CheckedState): ExportSelection[] => {
    const selections: ExportSelection[] = []

    data.forEach((env) => {
      const envKey = env.environment_key
      const envChecked = newChecked.environments.has(envKey)
      const pipelines = env.pipelines || []

      if (envChecked) {
        // Entire environment selected
        selections.push({
          environment_key: envKey,
          pipeline_key: "",
          resource_keys: [],
        })
      } else {
        // Check pipelines
        pipelines.forEach((pipe) => {
          const pipeKey = `${envKey}:${pipe.pipeline_key}`
          const pipeChecked = newChecked.pipelines.has(pipeKey)
          const configs = pipe.configs || []

          if (pipeChecked) {
            // Entire pipeline selected
            selections.push({
              environment_key: envKey,
              pipeline_key: pipe.pipeline_key,
              resource_keys: [],
            })
          } else {
            // Check individual configs
            const selectedConfigs = configs
              .filter((cfg) => newChecked.configs.has(`${pipeKey}:${cfg.resource_key}`))
              .map((cfg) => cfg.resource_key)

            if (selectedConfigs.length > 0) {
              selections.push({
                environment_key: envKey,
                pipeline_key: pipe.pipeline_key,
                resource_keys: selectedConfigs,
              })
            }
          }
        })
      }
    })

    return selections
  }, [data])

  // Handle environment checkbox change
  const handleEnvChange = (env: ExportTreeEnvironment, isChecked: boolean) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipelines = env.pipelines || []

      if (isChecked) {
        next.environments.add(env.environment_key)
        // Select all pipelines and configs
        pipelines.forEach((pipe) => {
          const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
          next.pipelines.add(pipeKey)
          const configs = pipe.configs || []
          configs.forEach((cfg) => {
            next.configs.add(`${pipeKey}:${cfg.resource_key}`)
          })
        })
      } else {
        next.environments.delete(env.environment_key)
        // Deselect all pipelines and configs
        pipelines.forEach((pipe) => {
          const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
          next.pipelines.delete(pipeKey)
          const configs = pipe.configs || []
          configs.forEach((cfg) => {
            next.configs.delete(`${pipeKey}:${cfg.resource_key}`)
          })
        })
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  // Handle pipeline checkbox change
  const handlePipeChange = (env: ExportTreeEnvironment, pipe: ExportTreePipeline, isChecked: boolean) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      const configs = pipe.configs || []
      const pipelines = env.pipelines || []

      if (isChecked) {
        next.pipelines.add(pipeKey)
        // Select all configs
        configs.forEach((cfg) => {
          next.configs.add(`${pipeKey}:${cfg.resource_key}`)
        })
        // Check if all pipelines are selected -> select environment
        const allPipesSelected = pipelines.every((p) =>
          next.pipelines.has(`${env.environment_key}:${p.pipeline_key}`)
        )
        if (allPipesSelected) {
          next.environments.add(env.environment_key)
        }
      } else {
        next.pipelines.delete(pipeKey)
        next.environments.delete(env.environment_key)
        // Deselect all configs
        configs.forEach((cfg) => {
          next.configs.delete(`${pipeKey}:${cfg.resource_key}`)
        })
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  // Handle config checkbox change
  const handleConfigChange = (
    env: ExportTreeEnvironment,
    pipe: ExportTreePipeline,
    cfg: ExportTreeConfig,
    isChecked: boolean
  ) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      const cfgKey = `${pipeKey}:${cfg.resource_key}`
      const configs = pipe.configs || []
      const pipelines = env.pipelines || []

      if (isChecked) {
        next.configs.add(cfgKey)
        // Check if all configs are selected -> select pipeline
        const allConfigsSelected = configs.every((c) =>
          next.configs.has(`${pipeKey}:${c.resource_key}`)
        )
        if (allConfigsSelected) {
          next.pipelines.add(pipeKey)
          // Check if all pipelines are selected -> select environment
          const allPipesSelected = pipelines.every((p) =>
            next.pipelines.has(`${env.environment_key}:${p.pipeline_key}`)
          )
          if (allPipesSelected) {
            next.environments.add(env.environment_key)
          }
        }
      } else {
        next.configs.delete(cfgKey)
        next.pipelines.delete(pipeKey)
        next.environments.delete(env.environment_key)
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  // Get checkbox state for environment
  const getEnvCheckState = (env: ExportTreeEnvironment) => {
    if (checked.environments.has(env.environment_key)) {
      return { checked: true, indeterminate: false }
    }
    let hasChecked = false
    let hasUnchecked = false
    const pipelines = env.pipelines || []
    pipelines.forEach((pipe) => {
      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      if (checked.pipelines.has(pipeKey)) {
        hasChecked = true
      } else {
        const configs = pipe.configs || []
        configs.forEach((cfg) => {
          if (checked.configs.has(`${pipeKey}:${cfg.resource_key}`)) {
            hasChecked = true
          } else {
            hasUnchecked = true
          }
        })
      }
    })
    if (hasChecked && hasUnchecked) {
      return { checked: false, indeterminate: true }
    }
    if (hasChecked) {
      return { checked: true, indeterminate: false }
    }
    return { checked: false, indeterminate: false }
  }

  // Get checkbox state for pipeline
  const getPipeCheckState = (env: ExportTreeEnvironment, pipe: ExportTreePipeline) => {
    const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
    if (checked.pipelines.has(pipeKey)) {
      return { checked: true, indeterminate: false }
    }
    let hasChecked = false
    let hasUnchecked = false
    const configs = pipe.configs || []
    configs.forEach((cfg) => {
      if (checked.configs.has(`${pipeKey}:${cfg.resource_key}`)) {
        hasChecked = true
      } else {
        hasUnchecked = true
      }
    })
    if (hasChecked && hasUnchecked) {
      return { checked: false, indeterminate: true }
    }
    if (hasChecked) {
      return { checked: true, indeterminate: false }
    }
    return { checked: false, indeterminate: false }
  }

  // Calculate total counts
  const { totalEnvs, totalPipes, totalConfigs, selectedConfigs } = useMemo(() => {
    let envs = 0
    let pipes = 0
    let configs = 0
    let selected = 0

    data.forEach((env) => {
      envs++
      const pipelines = env.pipelines || []
      pipelines.forEach((pipe) => {
        pipes++
        const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
        const pipeConfigs = pipe.configs || []
        pipeConfigs.forEach((cfg) => {
          configs++
          if (checked.configs.has(`${pipeKey}:${cfg.resource_key}`)) {
            selected++
          }
        })
      })
    })

    return { totalEnvs: envs, totalPipes: pipes, totalConfigs: configs, selectedConfigs: selected }
  }, [data, checked])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2" />
        加载中...
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Layers className="w-12 h-12 mb-4 opacity-50" />
        <p>暂无数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {data.map((env) => {
        const envExpanded = expandedNodes.has(env.environment_key)
        const envState = getEnvCheckState(env)
        const pipelines = env.pipelines || []
        const envConfigCount = pipelines.reduce((sum, p) => sum + (p.config_count || 0), 0)

        return (
          <div key={env.environment_key} className="select-none">
            {/* Environment Row */}
            <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md">
              <button
                onClick={() => toggleExpand(env.environment_key)}
                className="p-0.5 hover:bg-muted rounded"
              >
                {envExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <Checkbox
                checked={envState.checked}
                onCheckedChange={(c) => handleEnvChange(env, c === true)}
                className={envState.indeterminate ? "data-[state=checked]:bg-primary/50" : ""}
              />
              {envExpanded ? (
                <FolderOpen className="w-4 h-4 text-blue-500" />
              ) : (
                <Folder className="w-4 h-4 text-blue-500" />
              )}
              <span className="flex-1 text-sm font-medium">{env.environment_name}</span>
              <Badge variant="secondary" className="text-xs">
                {pipelines.length} 渠道 / {envConfigCount} 配置
              </Badge>
            </div>

            {/* Pipelines */}
            {envExpanded && (
              <div className="ml-6">
                {pipelines.map((pipe) => {
                  const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
                  const pipeExpanded = expandedNodes.has(pipeKey)
                  const pipeState = getPipeCheckState(env, pipe)
                  const configs = pipe.configs || []

                  return (
                    <div key={pipeKey}>
                      {/* Pipeline Row */}
                      <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md">
                        <button
                          onClick={() => toggleExpand(pipeKey)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          {pipeExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <Checkbox
                          checked={pipeState.checked}
                          onCheckedChange={(c) => handlePipeChange(env, pipe, c === true)}
                          className={pipeState.indeterminate ? "data-[state=checked]:bg-primary/50" : ""}
                        />
                        <Folder className="w-4 h-4 text-emerald-500" />
                        <span className="flex-1 text-sm">{pipe.pipeline_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {pipe.config_count || 0} 配置
                        </Badge>
                      </div>

                      {/* Configs */}
                      {pipeExpanded && configs.length > 0 && (
                        <div className="ml-6">
                          {configs.map((cfg) => {
                            const cfgKey = `${pipeKey}:${cfg.resource_key}`
                            const cfgChecked = checked.configs.has(cfgKey)

                            return (
                              <div
                                key={cfgKey}
                                className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md"
                              >
                                <div className="w-5" />
                                <Checkbox
                                  checked={cfgChecked}
                                  onCheckedChange={(c) => handleConfigChange(env, pipe, cfg, c === true)}
                                />
                                <FileText className="w-4 h-4 text-amber-500" />
                                <span className="flex-1 text-sm text-muted-foreground">
                                  {cfg.name || cfg.alias}
                                </span>
                                <Badge variant="outline" className="text-xs">
                                  {cfg.type}
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Summary */}
      <div className="pt-4 mt-4 border-t text-sm text-muted-foreground">
        共 {totalEnvs} 个环境，{totalPipes} 个渠道，{totalConfigs} 个配置
        {selectedConfigs > 0 && (
          <span className="text-primary ml-2">
            (已选择 {selectedConfigs} 个配置)
          </span>
        )}
      </div>
    </div>
  )
}

// ==================== Import Preview Tree ====================

interface ImportPreviewTreeProps {
  data: ImportPreviewEnvironment[]
  onChange: (selections: ExportSelection[]) => void
}

export function ImportPreviewTree({ data, onChange }: ImportPreviewTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [checked, setChecked] = useState<CheckedState>(() => {
    // Initially select all
    const initial: CheckedState = {
      environments: new Set(),
      pipelines: new Set(),
      configs: new Set(),
    }
    data.forEach((env) => {
      initial.environments.add(env.environment_key)
      const pipelines = env.pipelines || []
      pipelines.forEach((pipe) => {
        const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
        initial.pipelines.add(pipeKey)
        const configs = pipe.configs || []
        configs.forEach((cfg) => {
          initial.configs.add(`${pipeKey}:${cfg.resource_key}`)
        })
      })
    })
    return initial
  })

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  // Calculate selections
  const calculateSelections = useCallback((newChecked: CheckedState): ExportSelection[] => {
    const selections: ExportSelection[] = []

    data.forEach((env) => {
      const envKey = env.environment_key
      const envChecked = newChecked.environments.has(envKey)
      const pipelines = env.pipelines || []

      if (envChecked) {
        selections.push({
          environment_key: envKey,
          pipeline_key: "",
          resource_keys: [],
        })
      } else {
        pipelines.forEach((pipe) => {
          const pipeKey = `${envKey}:${pipe.pipeline_key}`
          const pipeChecked = newChecked.pipelines.has(pipeKey)
          const configs = pipe.configs || []

          if (pipeChecked) {
            selections.push({
              environment_key: envKey,
              pipeline_key: pipe.pipeline_key,
              resource_keys: [],
            })
          } else {
            const selectedConfigs = configs
              .filter((cfg) => newChecked.configs.has(`${pipeKey}:${cfg.resource_key}`))
              .map((cfg) => cfg.resource_key)

            if (selectedConfigs.length > 0) {
              selections.push({
                environment_key: envKey,
                pipeline_key: pipe.pipeline_key,
                resource_keys: selectedConfigs,
              })
            }
          }
        })
      }
    })

    return selections
  }, [data])

  // Handlers similar to ExportTreeSelect
  const handleEnvChange = (env: ImportPreviewEnvironment, isChecked: boolean) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipelines = env.pipelines || []

      if (isChecked) {
        next.environments.add(env.environment_key)
        pipelines.forEach((pipe) => {
          const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
          next.pipelines.add(pipeKey)
          const configs = pipe.configs || []
          configs.forEach((cfg) => {
            next.configs.add(`${pipeKey}:${cfg.resource_key}`)
          })
        })
      } else {
        next.environments.delete(env.environment_key)
        pipelines.forEach((pipe) => {
          const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
          next.pipelines.delete(pipeKey)
          const configs = pipe.configs || []
          configs.forEach((cfg) => {
            next.configs.delete(`${pipeKey}:${cfg.resource_key}`)
          })
        })
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  const handlePipeChange = (env: ImportPreviewEnvironment, pipe: ImportPreviewPipeline, isChecked: boolean) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      const configs = pipe.configs || []
      const pipelines = env.pipelines || []

      if (isChecked) {
        next.pipelines.add(pipeKey)
        configs.forEach((cfg) => {
          next.configs.add(`${pipeKey}:${cfg.resource_key}`)
        })
        const allPipesSelected = pipelines.every((p) =>
          next.pipelines.has(`${env.environment_key}:${p.pipeline_key}`)
        )
        if (allPipesSelected) {
          next.environments.add(env.environment_key)
        }
      } else {
        next.pipelines.delete(pipeKey)
        next.environments.delete(env.environment_key)
        configs.forEach((cfg) => {
          next.configs.delete(`${pipeKey}:${cfg.resource_key}`)
        })
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  const handleConfigChange = (
    env: ImportPreviewEnvironment,
    pipe: ImportPreviewPipeline,
    cfg: ImportPreviewConfig,
    isChecked: boolean
  ) => {
    setChecked((prev) => {
      const next: CheckedState = {
        environments: new Set(prev.environments),
        pipelines: new Set(prev.pipelines),
        configs: new Set(prev.configs),
      }

      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      const cfgKey = `${pipeKey}:${cfg.resource_key}`
      const configs = pipe.configs || []
      const pipelines = env.pipelines || []

      if (isChecked) {
        next.configs.add(cfgKey)
        const allConfigsSelected = configs.every((c) =>
          next.configs.has(`${pipeKey}:${c.resource_key}`)
        )
        if (allConfigsSelected) {
          next.pipelines.add(pipeKey)
          const allPipesSelected = pipelines.every((p) =>
            next.pipelines.has(`${env.environment_key}:${p.pipeline_key}`)
          )
          if (allPipesSelected) {
            next.environments.add(env.environment_key)
          }
        }
      } else {
        next.configs.delete(cfgKey)
        next.pipelines.delete(pipeKey)
        next.environments.delete(env.environment_key)
      }

      onChange(calculateSelections(next))
      return next
    })
  }

  const getEnvCheckState = (env: ImportPreviewEnvironment) => {
    if (checked.environments.has(env.environment_key)) {
      return { checked: true, indeterminate: false }
    }
    let hasChecked = false
    let hasUnchecked = false
    const pipelines = env.pipelines || []
    pipelines.forEach((pipe) => {
      const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
      if (checked.pipelines.has(pipeKey)) {
        hasChecked = true
      } else {
        const configs = pipe.configs || []
        configs.forEach((cfg) => {
          if (checked.configs.has(`${pipeKey}:${cfg.resource_key}`)) {
            hasChecked = true
          } else {
            hasUnchecked = true
          }
        })
      }
    })
    if (hasChecked && hasUnchecked) return { checked: false, indeterminate: true }
    if (hasChecked) return { checked: true, indeterminate: false }
    return { checked: false, indeterminate: false }
  }

  const getPipeCheckState = (env: ImportPreviewEnvironment, pipe: ImportPreviewPipeline) => {
    const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
    if (checked.pipelines.has(pipeKey)) {
      return { checked: true, indeterminate: false }
    }
    let hasChecked = false
    let hasUnchecked = false
    const configs = pipe.configs || []
    configs.forEach((cfg) => {
      if (checked.configs.has(`${pipeKey}:${cfg.resource_key}`)) {
        hasChecked = true
      } else {
        hasUnchecked = true
      }
    })
    if (hasChecked && hasUnchecked) return { checked: false, indeterminate: true }
    if (hasChecked) return { checked: true, indeterminate: false }
    return { checked: false, indeterminate: false }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "new":
        return <Badge variant="default" className="text-xs bg-emerald-500">新增</Badge>
      case "exists":
        return <Badge variant="secondary" className="text-xs">已存在</Badge>
      case "conflict":
        return <Badge variant="destructive" className="text-xs">冲突</Badge>
      default:
        return null
    }
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Layers className="w-12 h-12 mb-4 opacity-50" />
        <p>暂无数据</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {data.map((env) => {
        const envExpanded = expandedNodes.has(env.environment_key)
        const envState = getEnvCheckState(env)
        const pipelines = env.pipelines || []
        const envConfigCount = pipelines.reduce((sum, p) => sum + (p.configs?.length || 0), 0)

        return (
          <div key={env.environment_key} className="select-none">
            <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md">
              <button
                onClick={() => toggleExpand(env.environment_key)}
                className="p-0.5 hover:bg-muted rounded"
              >
                {envExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <Checkbox
                checked={envState.checked}
                onCheckedChange={(c) => handleEnvChange(env, c === true)}
                className={envState.indeterminate ? "data-[state=checked]:bg-primary/50" : ""}
              />
              {envExpanded ? (
                <FolderOpen className="w-4 h-4 text-blue-500" />
              ) : (
                <Folder className="w-4 h-4 text-blue-500" />
              )}
              <span className="flex-1 text-sm font-medium">{env.environment_name}</span>
              {getStatusBadge(env.status)}
              <Badge variant="outline" className="text-xs ml-1">
                {pipelines.length} 渠道 / {envConfigCount} 配置
              </Badge>
            </div>

            {envExpanded && (
              <div className="ml-6">
                {pipelines.map((pipe) => {
                  const pipeKey = `${env.environment_key}:${pipe.pipeline_key}`
                  const pipeExpanded = expandedNodes.has(pipeKey)
                  const pipeState = getPipeCheckState(env, pipe)
                  const configs = pipe.configs || []

                  return (
                    <div key={pipeKey}>
                      <div className="flex items-center gap-2 py-2 px-2 hover:bg-muted/50 rounded-md">
                        <button
                          onClick={() => toggleExpand(pipeKey)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          {pipeExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <Checkbox
                          checked={pipeState.checked}
                          onCheckedChange={(c) => handlePipeChange(env, pipe, c === true)}
                          className={pipeState.indeterminate ? "data-[state=checked]:bg-primary/50" : ""}
                        />
                        <Folder className="w-4 h-4 text-emerald-500" />
                        <span className="flex-1 text-sm">{pipe.pipeline_name}</span>
                        {getStatusBadge(pipe.status)}
                        <Badge variant="outline" className="text-xs ml-1">
                          {configs.length} 配置
                        </Badge>
                      </div>

                      {pipeExpanded && configs.length > 0 && (
                        <div className="ml-6">
                          {configs.map((cfg) => {
                            const cfgKey = `${pipeKey}:${cfg.resource_key}`
                            const cfgChecked = checked.configs.has(cfgKey)

                            return (
                              <div
                                key={cfgKey}
                                className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/50 rounded-md"
                              >
                                <div className="w-5" />
                                <Checkbox
                                  checked={cfgChecked}
                                  onCheckedChange={(c) => handleConfigChange(env, pipe, cfg, c === true)}
                                />
                                <FileText className="w-4 h-4 text-amber-500" />
                                <span className="flex-1 text-sm text-muted-foreground">
                                  {cfg.name || cfg.alias}
                                </span>
                                {getStatusBadge(cfg.status)}
                                <Badge variant="outline" className="text-xs ml-1">
                                  {cfg.type}
                                </Badge>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
