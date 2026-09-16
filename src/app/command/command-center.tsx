'use client';

import { useCallback, useMemo, useState } from 'react';
import { AgentsApp } from '@/components/apps/AgentsApp';
import { ChatApp } from '@/components/apps/ChatApp';
import { GithubApp } from '@/components/apps/GithubApp';
import { NodesApp } from '@/components/apps/NodesApp';
import { AccountApp } from '@/components/apps/AccountApp';
import { TerminalApp } from '@/components/apps/TerminalApp';
import { TopBar } from '@/components/hud/TopBar';
import { Dock } from '@/components/os/Dock';
import { NeoWindow } from '@/components/os/Window';
import { useViewport } from '@/components/os/useViewport';
import { useWindows } from '@/components/os/useWindows';
import type { AppId } from '@/components/os/types';
import { NeoScene, type SceneNode } from '@/components/scene/NeoScene';
import { useConfig } from '@/hooks/useConfig';
import { useFleet } from '@/hooks/useFleet';
import { useModels } from '@/hooks/useModels';

const ACCENTS: Record<AppId, string> = {
  chat: '#22d3ee',
  agents: '#a78bfa',
  nodes: '#5eead4',
  github: '#d7e3f4',
  terminal: '#60a5fa',
  system: '#fbbf24',
};

export function CommandCenter({ email }: { email: string }) {
  const fleet = useFleet();
  const { config } = useConfig();
  const { models } = useModels();
  const viewport = useViewport();
  const windows = useWindows(viewport);
  const compact = viewport.compact;

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [activityColor, setActivityColor] = useState<string | null>(null);
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const [speakReplies, setSpeakReplies] = useState(false);

  // The active model is derived, not synced: until the operator picks one it is
  // whichever tool-capable provider the catalogue offers first.
  const model = useMemo(() => {
    if (chosenModel) return chosenModel;
    const preferred =
      models.find((option) => option.value.startsWith('anthropic:')) ??
      models.find((option) => option.value.startsWith('openai:')) ??
      models[0];
    return preferred?.value ?? null;
  }, [chosenModel, models]);

  // On phones only one window is visible at a time, so opening one closes the rest.
  const openApp = useCallback(
    (id: AppId) => {
      if (compact) {
        for (const window of windows.windows) {
          if (window.id !== id && window.open) windows.close(window.id);
        }
      }
      windows.open(id);
    },
    [compact, windows],
  );

  const toggleApp = useCallback(
    (id: AppId) => {
      // On a phone only one panel is visible, so a tap brings an app to the
      // front; it only closes the app that is already in front.
      if (compact) {
        if (windows.focused?.id === id) windows.minimize(id);
        else openApp(id);
        return;
      }
      windows.toggle(id);
    },
    [compact, openApp, windows],
  );

  const sceneNodes = useMemo<SceneNode[]>(
    () =>
      fleet.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        health: node.health,
        load: Math.min(1, (node.metrics.cpuPercent ?? 20) / 100),
      })),
    [fleet.nodes],
  );

  const handleSelectNode = useCallback(
    (id: string | null) => {
      setSelectedNode(id);
      if (id) openApp('nodes');
    },
    [openApp],
  );

  const contentFor = (id: AppId) => {
    switch (id) {
      case 'chat':
        return <ChatApp model={model} speakReplies={speakReplies} />;
      case 'agents':
        return (
          <AgentsApp
            model={model}
            agents={config?.agents ?? []}
            pipeline={config?.pipeline ?? ['planner', 'researcher', 'engineer', 'reviewer']}
            onActivity={setActivityColor}
          />
        );
      case 'nodes':
        return (
          <NodesApp
            nodes={fleet.nodes}
            events={fleet.events}
            selectedId={selectedNode}
            demo={fleet.demo}
            error={fleet.error}
            onSelect={setSelectedNode}
          />
        );
      case 'github':
        return <GithubApp />;
      case 'terminal':
        return (
          <TerminalApp
            nodes={fleet.nodes}
            events={fleet.events}
            operator={email}
            store={fleet.store}
            model={model}
            onOpenApp={openApp}
            onSelectNode={handleSelectNode}
          />
        );
      case 'system':
        return (
          <AccountApp
            config={config}
            speakReplies={speakReplies}
            onSpeakRepliesChange={setSpeakReplies}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="neo-scanlines relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">
        <NeoScene
          nodes={sceneNodes}
          selectedId={selectedNode}
          activityColor={activityColor}
          onSelect={handleSelectNode}
        />
      </div>
      <div className="neo-grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />

      <TopBar
        operator={email}
        storeKind={fleet.store}
        demo={fleet.demo}
        summary={fleet.summary}
        models={models}
        model={model}
        onModelChange={setChosenModel}
        onRefresh={fleet.refresh}
        busy={fleet.loading}
      />

      {(compact ? (windows.focused ? [windows.focused] : []) : windows.windows).map((window) => (
        <NeoWindow
          key={window.id}
          state={window}
          compact={compact}
          accent={ACCENTS[window.id]}
          onFocus={() => windows.focus(window.id)}
          onClose={() => windows.close(window.id)}
          onMinimize={() => windows.minimize(window.id)}
          onMaximize={() => windows.maximize(window.id)}
          onMove={(x, y) => windows.move(window.id, x, y)}
          onResize={(width, height) => windows.resize(window.id, width, height)}
        >
          {contentFor(window.id)}
        </NeoWindow>
      ))}

      <Dock windows={windows.windows} onToggle={toggleApp} />
    </main>
  );
}
