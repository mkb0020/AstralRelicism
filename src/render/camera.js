// CAMERA. cam.x / cam.y = the world point at the centre of the view.
// Vertical dead zone: the camera's height only follows the player when she leaves a band around it,
// or when she stands on something - so a normal jump barely moves the camera.
import { clamp } from '../core/math.js';

export const CAM = {
  lerpX: 6,            // how quickly it catches up sideways (1/s)
  feetBelowCentre: 200, // where her feet sit relative to the view centre (world px)
  deadUp: 280, deadDown: 140, lerpY: 2.5,
};

export function createCamera() {
  const cam = { x: 0, y: 0, fy: 0, viewW: 1920, viewH: 1080 };
  const clampToRoom = room => {
    cam.x = room.w <= cam.viewW ? room.w / 2 : clamp(cam.x, cam.viewW / 2, room.w - cam.viewW / 2);
    cam.y = room.h <= cam.viewH ? room.h / 2 : clamp(cam.y, cam.viewH / 2, room.h - cam.viewH / 2);
  };
  cam.snapTo = (x, y, room) => { cam.x = x; cam.y = cam.fy = y - CAM.feetBelowCentre; clampToRoom(room); };
  // tx, ty = interpolated feet position; dt = real frame time
  cam.follow = (tx, ty, grounded, room, dt, frozen) => {
    const targetY = ty - CAM.feetBelowCentre;
    if (grounded || (!CAM.deadUp && !CAM.deadDown)) cam.fy = targetY;      // standing on something: centre on it
    else if (targetY < cam.fy - CAM.deadUp) cam.fy = targetY + CAM.deadUp;   // climbed out of the top of the band
    else if (targetY > cam.fy + CAM.deadDown) cam.fy = targetY - CAM.deadDown; // fell out of the bottom
    if (!frozen) {
      cam.x += (tx - cam.x) * Math.min(1, dt * CAM.lerpX);
      cam.y += (cam.fy - cam.y) * Math.min(1, dt * CAM.lerpY);
    }
    clampToRoom(room);
  };
  return cam;
}
