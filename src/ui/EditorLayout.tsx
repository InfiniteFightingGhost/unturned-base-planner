/**
 * Editor shell layout.
 *
 * Blender/CAD-inspired arrangement: a thin top bar (identity + document
 * lifecycle + grouped command bar), a vertical icon tool rail, a collapsible
 * left dock (Library / Prefabs), the filling 3D viewport, a collapsible,
 * scrollable right inspector dock, and a monospace status bar.
 *
 * The imperative `PieceField` handle is shared with the controllers through
 * context so they can pick without lifting transforms into React state. The
 * global shortcut hook is installed once here.
 */

import { useRef, useState } from 'react';
import { BlueprintOverlay, PieceField, Viewport } from '@/engine';
import type { PieceFieldHandle } from '@/engine';
import { PlacementController } from '@/editor/tools/PlacementController';
import { SelectionController } from '@/editor/tools/SelectionController';
import { TransformController } from '@/editor/tools/TransformController';
import { MeasurementController } from '@/editor/tools/MeasurementController';
import { PieceFieldContext } from '@/editor/tools/PieceFieldContext';
import type { PieceFieldRef } from '@/editor/tools/PieceFieldContext';
import { useGlobalShortcuts } from '@/editor/tools/shortcuts';
import { PieceLibrary } from './PieceLibrary';
import { ProjectPanel } from './ProjectPanel';
import { FloorSelector } from './FloorSelector';
import { ZonePanel } from './ZonePanel';
import { PatternPanel } from './PatternPanel';
import { PrefabPanel } from './PrefabPanel';
import { BlueprintPanel } from './BlueprintPanel';
import { MeasurementPanel } from './MeasurementPanel';
import { ResourcePanel } from './ResourcePanel';
import { InventoryPanel } from './InventoryPanel';
import { ProgressPanel } from './ProgressPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { ToolStrip } from './ToolStrip';

export function EditorLayout() {
  useGlobalShortcuts();
  const pieceFieldRef = useRef<PieceFieldHandle | null>(null);
  const contextRef: PieceFieldRef = pieceFieldRef;
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  return (
    <div className="editor-shell">
      <TopBar
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={() => setLeftOpen((value) => !value)}
        onToggleRight={() => setRightOpen((value) => !value)}
      />

      <div className="editor-body">
        <ToolStrip />

        {leftOpen ? (
          <div className="dock dock-left">
            <PieceLibrary />
            <PrefabPanel />
          </div>
        ) : null}

        <section className="viewport-panel" aria-label="3D viewport">
          <Viewport>
            <PieceFieldContext.Provider value={contextRef}>
              <PieceField ref={pieceFieldRef} />
              <BlueprintOverlay />
              <PlacementController />
              <SelectionController />
              <TransformController />
              <MeasurementController />
            </PieceFieldContext.Provider>
          </Viewport>
        </section>

        {rightOpen ? (
          <div className="dock dock-right">
            <PropertiesPanel />
            <FloorSelector />
            <ZonePanel />
            <PatternPanel />
            <ResourcePanel />
            <InventoryPanel />
            <ProgressPanel />
            <BlueprintPanel />
            <MeasurementPanel />
            <ProjectPanel />
          </div>
        ) : null}
      </div>

      <StatusBar />
    </div>
  );
}
