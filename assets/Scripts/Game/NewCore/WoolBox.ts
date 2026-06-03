import { _decorator, BoxCollider, Color, Component, geometry, GradientRange, instantiate, Line, MeshRenderer, Node, PhysicsSystem, randomRange, tween, Tween, Vec3, Widget } from 'cc';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { VehicleData } from '../LevelDataSA';
import { ServiceLocator } from '../../ServiceLocator';
import { GameManager } from '../GameManager';
import { Clickable } from '../../Clickable';
import { SlotManager } from '../SlotManager';
import { EDITOR, PREVIEW } from 'cc/env';
import { WoolBoxManager } from './WoolBoxManager';
import { GameConfig } from '../GameConfigSA';
import { Spool } from '../Spool';
import { SpoolManager } from '../SpoolManager';
import { Slot } from '../Slot';
import { TutorialController } from '../UI/TutorialController';
import { ETrackingEvent, TrackingManager } from '../../TrackingManager';
import { HitVfxPool } from './HitVfxPool';
import { SoundManager } from '../../SoundManager';
import { darkenColor } from 'db://assets/Deps/iKame/scripts/utils/ColorUtils';
const { ccclass, property } = _decorator;

@ccclass('WoolBox')
export class WoolBox extends Clickable {

    @property(MeshRenderer) public renderer: MeshRenderer = null
    @property(Line) public debugRayLine: Line = null


    @property speed: number = 30
    @property public raycastDistance: number = 100
    @property public showDebugRay: boolean = true
    @property public hitForwardDistance: number = 0.45
    @property public hitTargetPushDistance: number = 0.18
    @property public impactGap: number = 0.05

    // Bán kính bo cua: càng lớn thì khúc cua drift cong tròn hơn
    @property public cornerRadius: number = 10
    // Số đoạn nhỏ để dựng mỗi cung cua (càng cao càng mượt)
    @property public cornerSegments: number = 100


    isMoving = false

    protected _woolBoxManager: WoolBoxManager = null


    protected gameConfig: GameConfig = null;
    protected _color: Color = null
    protected _data: VehicleData = null
    protected spoolManager: SpoolManager = null

    private _spool: Spool = null
    private _reservedSlot: Slot = null

    protected onLoad(): void {
        this.gameConfig = ServiceLocator.get(GameConfig)
        this.spoolManager = ServiceLocator.get(SpoolManager);
    }


    init(data: VehicleData, colorConfig: PlayableColorConfig, woolBoxManager: WoolBoxManager) {
        const mat = this.renderer.getMaterialInstance(0);
        this._color = colorConfig.getMainColor(data.colorTypeValue)
        this._data = data
        mat.setProperty("mainColor", this._color);
        mat.setProperty("shadowColor", darkenColor(this._color, 0.5));

        if (this.debugRayLine) {
            const temp = new GradientRange()
            temp.color = colorConfig.getMainColor(data.colorTypeValue)
            this.debugRayLine.color = temp
        }
        this._woolBoxManager = woolBoxManager


        const node = instantiate(this.gameConfig.spoolPrefab)
        const spool = node.getComponent(Spool);
        spool.init({
            x: 0,
            y: 0,
            colorId: this._data.colorTypeValue
        }, this.spoolManager)
        this._spool = spool
        // this.spoolManager.spools.push(this._spool);
        // spool.setColor(this._data.colorTypeValue)

    }

    public onClick() {
        if (this.isMoving) return;

        const tut = ServiceLocator.get(TutorialController)
        if (tut && tut.node.active) {
            tut.node.active = false
            TrackingManager.TrackEvent(ETrackingEvent.CHALLENGE_STARTED)
        }

        const slot = ServiceLocator.get(SlotManager).getAvailableSlot()
        if (slot) {
            if (this.isBlocked()) {
                console.log("blocked");
                const hitInfo = this.getFirstBlockHit();
                if (hitInfo) {
                    this.moveForwardAndReturn(hitInfo.box.node, hitInfo.distance)
                }
                return
            }
            else {
                // console.log("ko blocked");
                this._reservedSlot = slot;
                // Reserve slot but don't set spool yet (prevents early collection)
                slot['_reservedBy'] = this;
                this.moveForwardAndTurnToTarget(slot.placePos, slot)

            }
        }
        else {
            this.playClickBounce()
            SoundManager.instance.playOneShot('Failed')
        }
    }


    spawnSpool(slot: Slot) {
        if (!slot || slot['_reservedBy'] !== this) {
            console.warn("Slot not reserved by this box, aborting spawn");
            this.node.active = false;
            this._reservedSlot = null;
            return;
        }
        // Now set the spool when actually placing it
        slot.setSpool(this._spool);
        this._spool.node.setParent(this.spoolManager.node);

        // The box ended its travel sitting on the slot, so morph it in place:
        // it squashes, collapses into itself, and the spool springs out of the
        // burst with a little hop before settling into the slot.
        const boxWorldPos = this.node.worldPosition.clone();
        const targetPos = slot.placePos.worldPosition.clone();
        const popPos = boxWorldPos.clone();
        popPos.y += 0.4; // small upward pop as the spool springs free

        const boxBaseScale = this.node.scale.clone();
        const boxSquash = new Vec3(boxBaseScale.x * 1.22, boxBaseScale.y * 0.6, boxBaseScale.z * 1.22);

        // Spool starts hidden inside the box, ready to burst out.
        this._spool.node.setWorldPosition(boxWorldPos);
        this._spool.node.eulerAngles = new Vec3(-90, 90, 90);
        this._spool.node.setScale(new Vec3(0, 0, 0));

        // 1) Box anticipates (squashes down) then collapses into itself.
        tween(this.node)
            .to(0.09, { scale: boxSquash }, { easing: 'quadOut' })
            .to(0.1, { scale: new Vec3(0.001, 0.001, 0.001) }, { easing: 'backIn' })
            .call(() => { this.node.active = false; })
            .start();

        // 2) At the burst, puff + pop, then the spool springs out and settles.
        const overshoot = new Vec3(1.18, 1.18, 1.18);
        const landSquash = new Vec3(1.16, 0.78, 1.16);
        const landStretch = new Vec3(0.9, 1.12, 0.9);

        tween(this._spool.node)
            .delay(0.09) // wait out the box's anticipation
            .call(() => {
                const e = HitVfxPool.spawn();
                e.setWorldPosition(boxWorldPos);
                e.setScale(3, 3, 3);
                SoundManager.instance.playOneShot('Pop');
                tween(e).delay(0.4).call(() => HitVfxPool.release(e)).start();
            })
            // spring out of the box with overshoot, popping up slightly
            .to(0.2, { worldPosition: popPos, scale: overshoot }, { easing: 'backOut' })
            // drop into the slot, squashing on impact
            .to(0.14, { worldPosition: targetPos, scale: landSquash }, { easing: 'quadIn' })
            // stretch back up...
            .to(0.08, { scale: landStretch }, { easing: 'quadOut' })
            // ...and settle to rest
            .to(0.1, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
            .call(() => {
                this._spool.placeInSlot(slot, () => { });
            })
            .start();

        slot['_reservedBy'] = null;
        this._reservedSlot = null;


    }


    moveForwardAndReturn(target: Node, hitDistance?: number) {
        if (this.isMoving) return
        if (!target || !target.isValid) return;
        if (this._reservedSlot) {
            this._reservedSlot['_reservedBy'] = null;
            this._reservedSlot = null;
        }
        this.isMoving = true
        const selfStartPos = this.node.position.clone();
        const selfStartScale = this.node.scale.clone();
        const targetStartPos = target.position.clone();
        const targetStartScale = target.scale.clone();
        const selfStartWorld = this.node.worldPosition.clone();
        const targetStartWorld = target.worldPosition.clone();

        const attackDirection = this.node.forward.clone().normalize().multiplyScalar(-1);
        const distanceToTarget = Vec3.distance(selfStartWorld, targetStartWorld);
        const approachDistance = Math.max(0, (hitDistance ?? distanceToTarget) - this.impactGap);
        const hitWorld = selfStartWorld.clone().add(attackDirection.clone().multiplyScalar(approachDistance));
        const reboundWorld = selfStartWorld.clone().add(attackDirection.clone().multiplyScalar(approachDistance * 0.35));
        const targetHitWorld = targetStartWorld.clone().add(attackDirection.clone().multiplyScalar(this.hitTargetPushDistance));

        const hitPos = new Vec3();
        const reboundPos = new Vec3();
        const targetHitPos = new Vec3();

        if (this.node.parent) {
            this.node.parent.inverseTransformPoint(hitPos, hitWorld);
            this.node.parent.inverseTransformPoint(reboundPos, reboundWorld);
        } else {
            hitPos.set(hitWorld);
            reboundPos.set(reboundWorld);
        }

        if (target.parent) {
            target.parent.inverseTransformPoint(targetHitPos, targetHitWorld);
        } else {
            targetHitPos.set(targetHitWorld);
        }

        const selfSquashScale = new Vec3(selfStartScale.x * 1.08, selfStartScale.y * 0.92, selfStartScale.z * 1.08);
        const selfReboundScale = new Vec3(selfStartScale.x * 0.98, selfStartScale.y * 1.03, selfStartScale.z * 0.98);
        const targetSquashScale = new Vec3(targetStartScale.x * 1.05, targetStartScale.y * 0.95, targetStartScale.z * 1.05);

        Tween.stopAllByTarget(this.node);
        Tween.stopAllByTarget(target);
        const effect = HitVfxPool.spawn()
        effect.setScale(3, 3, 3)
        effect.setWorldPosition(hitWorld)
        SoundManager.instance.playOneShot("Pop")
        tween(this.node)
            .to(0.1, {
                position: hitPos,
                scale: selfSquashScale,
            }, { easing: 'quadOut' })
            .to(0.08, {
                position: reboundPos,
                scale: selfReboundScale,
            }, { easing: 'quadInOut' })
            .to(0.12, {
                position: selfStartPos,
                scale: selfStartScale,
            }, { easing: 'backOut' })
            .call(() => {
                this.isMoving = false
                HitVfxPool.release(effect)
            })
            .start();

        tween(target)
            .to(0.08, {
                position: targetHitPos,
                scale: targetSquashScale,
            }, { easing: 'quadOut' })
            .to(0.12, {
                position: targetStartPos,
                scale: targetStartScale,
            }, { easing: 'backOut' })
            .start();

    }

    private isBocuncePlaying: boolean = false;
    public playClickBounce(onDone?: Function, onStart?: Function) {
        if (this.isBocuncePlaying) return;
        const baseScale = this.node.scale.clone();
        // if (baseScale.x === 0 && baseScale.y === 0 && baseScale.z === 0) {
        //     onDone?.();
        //     return;
        // }
        const basePosition = this.node.position.clone();
        this.isBocuncePlaying = true;
        onStart?.();
        // Squash & stretch: lún xuống ở trục giữa, nở nhẹ 2 bên.
        const squashScale = new Vec3(baseScale.x * 1.13, baseScale.y * 0.82, baseScale.z * 1.13);
        const squashPosition = new Vec3(basePosition.x, basePosition.y - 0.11, basePosition.z);
        const reboundScale = new Vec3(baseScale.x * 0.97, baseScale.y * 1.06, baseScale.z * 0.97);

        tween(this.node)
            .to(0.06, {
                scale: squashScale,
                position: squashPosition,
            }, { easing: 'quadOut' })
            .to(0.08, {
                scale: reboundScale,
                position: basePosition,
            }, { easing: 'quadInOut' })
            .to(0.1, {
                scale: baseScale,
                position: basePosition,
            }, { easing: 'backOut' })
            .call(() => {
                this.isBocuncePlaying = false;
                onDone?.()
            })
            .start();
        // this.bouceTween?.start();
    }

    moveForwardAndTurnToTarget(target: Node, slot: Slot) {
        if (this.isMoving) return;
        if (!target || !target.isValid || !this._woolBoxManager || !slot) return;

        this.isMoving = true;
        this.getComponent(BoxCollider).destroy()
        Tween.stopAllByTarget(this.node);
        SoundManager.instance.playOneShot("Click")

        const manager = this._woolBoxManager;
        const startLocal = this.node.position.clone();
        const targetLocal = new Vec3();
        manager.node.inverseTransformPoint(targetLocal, target.worldPosition);

        const bounds = this.getNormalizedBounds();
        const forwardLocal = this.getForwardInManagerSpace().normalize();
        const boundaryHit = this.getBoundaryHitPoint(startLocal, forwardLocal, bounds);
        const targetPerimeterPoint = this.getClosestPerimeterPoint(targetLocal, bounds);
        const perimeterPath = this.buildPerimeterPath(boundaryHit, targetPerimeterPoint, bounds);

        const moveSpeed = Math.max(this.speed, 0.01);
        let chain = tween(this.node);
        let currentPoint = startLocal.clone();
        let currentEuler = this.node.eulerAngles.clone();
        let isFirstSegment = true;

        const rawPath = [startLocal, boundaryHit, ...perimeterPath, targetLocal];
        const roundedPath = this.roundCornerPath(rawPath, this.cornerRadius, Math.max(2, Math.floor(this.cornerSegments)));
        // Bỏ điểm đầu (startLocal) vì currentPoint đã bắt đầu từ đó
        const fullPath = roundedPath.slice(1);
        for (const nextPoint of fullPath) {
            const segmentDistance = Vec3.distance(currentPoint, nextPoint);
            if (segmentDistance <= 0.001) continue;

            if (isFirstSegment) {
                chain = chain.to(Math.max(segmentDistance / moveSpeed, 0.001), {
                    position: nextPoint,
                }, { easing: 'quadInOut' });
                isFirstSegment = false;
            } else {
                const segmentDirection = nextPoint.clone().subtract(currentPoint).normalize();
                const nextEuler = this.getEulerForMoveDirection(segmentDirection, currentEuler);

                // Linear cho các đoạn giữa/cung cua để box drift mượt, không khựng ở mỗi điểm
                chain = chain.to(Math.max(segmentDistance / moveSpeed, 0.001), {
                    position: nextPoint,
                    eulerAngles: nextEuler,
                }, { easing: 'linear' });
                currentEuler = nextEuler.clone();
            }

            currentPoint = nextPoint.clone();
        }

        // const finalEuler = new Vec3(0, 90, 0);
        const finalEuler = new Vec3(0, 0, 0);

        chain = chain.to(0.2, { eulerAngles: finalEuler }, { easing: 'quadInOut' });

        chain.call(() => {
            this.isMoving = false;
            this.node.eulerAngles = finalEuler.clone();
            
            this.spawnSpool(slot)
        }).start();

    }
    private getNormalizedBounds() {
        return {
            minX: this._woolBoxManager.minPositionX,
            maxX: this._woolBoxManager.maxPositionX,
            minZ: Math.min(this._woolBoxManager.minPositionZ, this._woolBoxManager.maxPositionZ),
            maxZ: Math.max(this._woolBoxManager.minPositionZ, this._woolBoxManager.maxPositionZ),
        };
    }

    private getForwardInManagerSpace(): Vec3 {
        const worldStart = this.node.worldPosition.clone();
        const worldForwardPoint = worldStart.clone().add(this.node.forward.clone().normalize().multiplyScalar(-1));
        const localStart = new Vec3();
        const localForwardPoint = new Vec3();

        this._woolBoxManager.node.inverseTransformPoint(localStart, worldStart);
        this._woolBoxManager.node.inverseTransformPoint(localForwardPoint, worldForwardPoint);

        return localForwardPoint.subtract(localStart);
    }

    private getBoundaryHitPoint(start: Vec3, direction: Vec3, bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): Vec3 {
        let hitDistance = Number.POSITIVE_INFINITY;

        if (direction.x > 0.0001) hitDistance = Math.min(hitDistance, (bounds.maxX - start.x) / direction.x);
        if (direction.x < -0.0001) hitDistance = Math.min(hitDistance, (bounds.minX - start.x) / direction.x);
        if (direction.z > 0.0001) hitDistance = Math.min(hitDistance, (bounds.maxZ - start.z) / direction.z);
        if (direction.z < -0.0001) hitDistance = Math.min(hitDistance, (bounds.minZ - start.z) / direction.z);

        if (!isFinite(hitDistance) || hitDistance < 0) {
            return start.clone();
        }

        return start.clone().add(direction.clone().multiplyScalar(hitDistance));
    }

    private getClosestPerimeterPoint(point: Vec3, bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): Vec3 {
        const candidates = [
            new Vec3(bounds.minX, point.y, this.clamp(point.z, bounds.minZ, bounds.maxZ)),
            new Vec3(bounds.maxX, point.y, this.clamp(point.z, bounds.minZ, bounds.maxZ)),
            new Vec3(this.clamp(point.x, bounds.minX, bounds.maxX), point.y, bounds.minZ),
            new Vec3(this.clamp(point.x, bounds.minX, bounds.maxX), point.y, bounds.maxZ),
        ];

        let closest = candidates[0];
        let closestDistance = Vec3.distance(point, closest);
        for (let i = 1; i < candidates.length; i++) {
            const candidateDistance = Vec3.distance(point, candidates[i]);
            if (candidateDistance < closestDistance) {
                closest = candidates[i];
                closestDistance = candidateDistance;
            }
        }

        return closest;
    }

    private buildPerimeterPath(start: Vec3, end: Vec3, bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): Vec3[] {
        const corners = [
            new Vec3(bounds.minX, start.y, bounds.minZ),
            new Vec3(bounds.maxX, start.y, bounds.minZ),
            new Vec3(bounds.maxX, start.y, bounds.maxZ),
            new Vec3(bounds.minX, start.y, bounds.maxZ),
        ];

        const startEdge = this.getPerimeterEdgeIndex(start, bounds);
        const endEdge = this.getPerimeterEdgeIndex(end, bounds);

        const clockwisePath = this.collectPerimeterPoints(start, end, corners, startEdge, endEdge, true);
        const counterClockwisePath = this.collectPerimeterPoints(start, end, corners, startEdge, endEdge, false);

        return this.getPathLength(start, clockwisePath, end) <= this.getPathLength(start, counterClockwisePath, end)
            ? clockwisePath
            : counterClockwisePath;
    }

    private collectPerimeterPoints(start: Vec3, end: Vec3, corners: Vec3[], startEdge: number, endEdge: number, clockwise: boolean): Vec3[] {
        const path: Vec3[] = [];
        const step = clockwise ? 1 : -1;
        let edge = startEdge;

        while (edge !== endEdge) {
            const nextCornerIndex = clockwise ? (edge + 1) % 4 : edge;
            path.push(corners[nextCornerIndex].clone());
            edge = (edge + step + 4) % 4;
        }

        path.push(end.clone());
        return path;
    }

    private getPerimeterEdgeIndex(point: Vec3, bounds: { minX: number, maxX: number, minZ: number, maxZ: number }): number {
        const eps = 0.001;
        if (Math.abs(point.z - bounds.minZ) <= eps) return 0;
        if (Math.abs(point.x - bounds.maxX) <= eps) return 1;
        if (Math.abs(point.z - bounds.maxZ) <= eps) return 2;
        return 3;
    }

    /**
     * Bo tròn các khúc cua của đường đi: tại mỗi đỉnh trong, cắt bớt 2 cạnh
     * một đoạn `radius` rồi dựng cung bezier bậc 2 (control = đỉnh cua) để box
     * drift cong tròn thay vì bẻ góc 90 độ.
     */
    private roundCornerPath(points: Vec3[], radius: number, segments: number): Vec3[] {
        if (radius <= 0.0001 || points.length < 3) {
            return points.map(p => p.clone());
        }

        const result: Vec3[] = [points[0].clone()];

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const corner = points[i];
            const next = points[i + 1];

            const inDir = corner.clone().subtract(prev);
            const outDir = next.clone().subtract(corner);
            const inLen = inDir.length();
            const outLen = outDir.length();
            if (inLen <= 0.0001 || outLen <= 0.0001) {
                result.push(corner.clone());
                continue;
            }

            inDir.multiplyScalar(1 / inLen);
            outDir.multiplyScalar(1 / outLen);

            // Đường thẳng (không phải khúc cua) -> giữ nguyên đỉnh
            if (Vec3.dot(inDir, outDir) > 0.999) {
                result.push(corner.clone());
                continue;
            }

            // Không cắt quá nửa cạnh để tránh chồng lấn cung kế bên
            const cut = Math.min(radius, inLen * 0.5, outLen * 0.5);
            const p0 = corner.clone().add(inDir.clone().multiplyScalar(-cut));
            const p2 = corner.clone().add(outDir.clone().multiplyScalar(cut));

            for (let s = 0; s <= segments; s++) {
                const t = s / segments;
                const mt = 1 - t;
                // Bezier bậc 2: (1-t)^2*p0 + 2(1-t)t*corner + t^2*p2
                const point = p0.clone().multiplyScalar(mt * mt)
                    .add(corner.clone().multiplyScalar(2 * mt * t))
                    .add(p2.clone().multiplyScalar(t * t));
                result.push(point);
            }
        }

        result.push(points[points.length - 1].clone());
        return result;
    }

    private getPathLength(start: Vec3, middlePoints: Vec3[], end: Vec3): number {
        let total = 0;
        let current = start;
        for (const point of middlePoints) {
            total += Vec3.distance(current, point);
            current = point;
        }
        total += Vec3.distance(current, end);
        return total;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private getEulerForMoveDirection(direction: Vec3, currentEuler: Vec3): Vec3 {
        const targetYaw = Math.atan2(direction.x, direction.z) * 180 / Math.PI;
        const deltaYaw = this.getShortestAngleDelta(currentEuler.y, targetYaw);
        return new Vec3(currentEuler.x, currentEuler.y + deltaYaw, currentEuler.z);
    }

    private getShortestAngleDelta(from: number, to: number): number {
        let delta = (to - from) % 360;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        return delta;
    }

    private getFirstBlockHit(): { box: WoolBox, distance: number } | null {
        const origin = this.node.worldPosition;
        const forward = this.node.forward.clone().normalize();
        const ray = new geometry.Ray(origin.x, origin.y, origin.z, -forward.x, -forward.y, -forward.z);
        const maxDistance = this.raycastDistance;

        if (!PhysicsSystem.instance.raycast(ray, 0xffffffff, maxDistance, true)) {
            return null;
        }

        let nearestHit: { box: WoolBox, distance: number } | null = null;

        for (const hit of PhysicsSystem.instance.raycastResults) {
            const hitNode = hit.collider?.node;
            if (!hitNode || hitNode === this.node) continue;

            const blockBox = hitNode.getComponent(WoolBox)
            if (!blockBox) continue;

            if (!nearestHit || hit.distance < nearestHit.distance) {
                nearestHit = {
                    box: blockBox,
                    distance: hit.distance,
                };
            }
        }

        return nearestHit;
    }


    protected lateUpdate(): void {
        if (!this.debugRayLine) return;

        if (!this.showDebugRay) {
            this.debugRayLine.positions = [];
            return;
        }

        if (EDITOR || PREVIEW) {
            // Raycast uses node.forward in world-space, which maps to local +Z of this node.
            this.debugRayLine.positions = [Vec3.ZERO, new Vec3(0, 0, this.raycastDistance)];
        }
    }

    getFirstBoxBlock(): WoolBox {
        return this.getFirstBlockHit()?.box ?? null;
    }

    isBlocked(): boolean {
        return this.getFirstBlockHit() !== null;
    }
}


