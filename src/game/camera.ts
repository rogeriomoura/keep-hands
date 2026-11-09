/** Camera follow + clamping (world units). */
import type { GameState, ViewInsets, ViewSize } from "./types";
import { clamp } from "./util";
import { worldZoom } from "../world";

export function updateCamera(state: GameState, view: ViewSize, insets: ViewInsets) {
  const zoom = worldZoom(view.width, view.height, state.world);
  // camera works in world units: the visible slice shrinks as we zoom in
  const viewW = view.width / zoom;
  const viewH = view.height / zoom;
  const targetX = state.player.x + state.player.w / 2 - viewW / 2;
  const targetY = state.player.y + state.player.h / 2 - viewH / 2 - 40;
  // Touch controls cover the stage edges: let the camera scroll past the world edge
  // far enough that the crate / far wall sit beside the buttons, not under them
  const minX = -insets.left / zoom;
  const maxX = Math.max(minX, state.world.width - viewW + insets.right / zoom);
  const maxY = Math.max(0, state.world.height - viewH);
  const tx = clamp(targetX, minX, maxX);
  const ty = clamp(targetY, 0, maxY);
  // soft follow
  state.camera.x += (tx - state.camera.x) * Math.min(1, 0.12);
  state.camera.y += (ty - state.camera.y) * Math.min(1, 0.12);
}
