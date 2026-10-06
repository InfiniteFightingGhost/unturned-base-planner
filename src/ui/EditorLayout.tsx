/**
 * Editor shell layout: toolbar, piece library, viewport (with the batched piece
 * field and interaction controllers), properties inspector and status bar.
 *
 * The imperative `PieceField` handle is shared with the controllers through
 * context so they can pick without lifting transforms into React state. The
 * global shortcut hook is installed once here.
 */

import { useRef } from 'react';
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
import { FloorSelector } from './FloorSelector';
import { ZonePanel } from './ZonePanel';
import { PatternPanel } from './PatternPanel';
import { PrefabPanel } from './PrefabPanel';
import { BlueprintPanel } from './BlueprintPanel';
import { MeasurementPanel } from './MeasurementPanel';
import { ResourcePanel } from './ResourcePanel';
import { InventoryPanel } from './InventoryPanel';
import { ProgressPanel } from './ProgressPanel';
import { Toolbar } from './Toolbar';
import { PropertiesPanel } from './PropertiesPanel';
import { StatusBar } from './StatusBar';

export function EditorLayout() {
  useGlobalShortcuts();
  const pieceFieldRef = useRef<PieceFieldHandle | null>(null);
  const contextRef: PieceFieldRef = pieceFieldRef;

  return (
    <div className="editor-shell">
      <header className="app-header">
        <h1>Unturned Base Planner</h1>
        <p className="app-tagline">Local-first 3D base planning for Unturned.</p>
      </header>

      <Toolbar />

      <div className="editor-body">
        <div className="editor-sidebar">
          <PieceLibrary />
          <FloorSelector />
          <ZonePanel />
          <PatternPanel />
          <PrefabPanel />
          <BlueprintPanel />
          <MeasurementPanel />
          <ResourcePanel />
          <InventoryPanel />
          <ProgressPanel />
        </div>

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

        <PropertiesPanel />
      </div>

      <StatusBar />
    </div>
  );
}
