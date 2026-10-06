/**
 * Static scene contents for the editor viewport: lighting and the ground grid.
 *
 * An HDR environment is intentionally avoided so the planner stays fully local-first
 * (no network asset fetch). A subtle two-light setup plus a hemisphere fill gives
 * enough shape definition without the cost of image-based lighting.
 */

import { EditorGrid } from '../grid/EditorGrid';

export function SceneContent() {
  return (
    <>
      <color attach="background" args={['#0f1115']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#9fb3d1', '#10131a', 0.45]} />
      <directionalLight position={[40, 60, 25]} intensity={1.1} color="#fff4e6" />
      <directionalLight position={[-30, 25, -35]} intensity={0.25} color="#8fb3ff" />
      <EditorGrid />
    </>
  );
}
