export { Viewer, type ViewerOptions } from './core/Viewer';
export { SceneRegistry, type RegisteredInstance } from './core/SceneRegistry';
export { Environment, type EnvironmentPreset } from './core/Environment';
export { SelectionIndicator } from './core/SelectionIndicator';
export { ConflictHighlighter, MAX_HIGHLIGHTS } from './core/ConflictHighlighter';
export { RotationGizmo } from './interaction/RotationGizmo';
export { RoomBuilder } from './scene/RoomBuilder';
export { PlacementPreview } from './scene/PlacementPreview';
export {
  CameraController,
  DEFAULT_LIMITS,
  type CameraLimits,
} from './interaction/CameraController';
export { QualityManager, type QualitySettings, type QualityLevel } from './perf/QualityManager';
export { Telemetry, type TelemetrySnapshot } from './perf/Telemetry';
export { detectTier } from './perf/detectTier';
export {
  SnapEngine,
  DEFAULT_SNAP,
  projectOnSegment,
  normalToRotationDeg,
  type SnapConfig,
  type SnapResult,
  type SnapTarget,
  type PointSnapTarget,
  type WallSnapTarget,
} from './interaction/SnapEngine';
export { GestureController, type GestureEvent, type ViewMode } from './interaction/GestureController';
export { AssetLoader, type AssetRef, type LodLevel } from './loading/AssetLoader';
