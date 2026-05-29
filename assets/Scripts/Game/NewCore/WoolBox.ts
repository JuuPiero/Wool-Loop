import { _decorator, BoxCollider, Component, geometry, GradientRange, Line, MeshRenderer, Node, PhysicsSystem, randomRange, tween, Tween, Vec3, Widget } from 'cc';
import { PlayableColorConfig } from '../../Data/ColorConfig';
import { VehicleData } from '../LevelDataSA';
import { ServiceLocator } from '../../ServiceLocator';
import { GameManager } from '../GameManager';
import { Clickable } from '../../Clickable';
import { SlotManager } from '../SlotManager';
import { EDITOR, PREVIEW } from 'cc/env';
import { WoolBoxManager } from './WoolBoxManager';
const { ccclass, property } = _decorator;

@ccclass('WoolBox')
export class WoolBox extends Clickable {

    @property(MeshRenderer) public renderer: MeshRenderer = null
    @property(Line) public debugRayLine: Line = null


    @property speed: number = 20
    @property public raycastDistance: number = 100
    @property public showDebugRay: boolean = true
    @property public hitForwardDistance: number = 0.45
    @property public hitTargetPushDistance: number = 0.18
    @property public impactGap: number = 0.05


    isMoving = false

    protected _woolBoxManager: WoolBoxManager = null



    init(data: VehicleData, colorConfig: PlayableColorConfig, woolBoxManager: WoolBoxManager) {
        const mat = this.renderer.getMaterialInstance(0);
        mat.setProperty("color", colorConfig.getMainColor(data.colorTypeValue));
        if (this.debugRayLine) {
            const temp = new GradientRange()
            temp.color = colorConfig.getMainColor(data.colorTypeValue)
            this.debugRayLine.color = temp
        }
        this._woolBoxManager = woolBoxManager
    }

    public onClick() {
        if (this.isMoving) return;

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
                console.log("ko blocked");
                // move thẳng 1 đoạn rồi vòng cung lên target
                this.moveForwardAndTurnToTarget(slot.node)
                
            }
        }
    }
    moveForwardAndReturn(target: Node, hitDistance?: number) {
        if(this.isMoving) return
        if (!target || !target.isValid) return;
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

    moveForwardAndTurnToTarget(target: Node) {
        if (this.isMoving) return;
        if (!target || !target.isValid || !this._woolBoxManager) return;

        this.isMoving = true;
        this.getComponent(BoxCollider).destroy()
        Tween.stopAllByTarget(this.node);

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

        const fullPath = [boundaryHit, ...perimeterPath, targetLocal];
        for (const nextPoint of fullPath) {
            const segmentDistance = Vec3.distance(currentPoint, nextPoint);
            if (segmentDistance <= 0.001) continue;

            if (isFirstSegment) {
                chain = chain.to(Math.max(segmentDistance / moveSpeed, 0.04), {
                    position: nextPoint,
                }, { easing: 'quadInOut' });
                isFirstSegment = false;
            } else {
                const segmentDirection = nextPoint.clone().subtract(currentPoint).normalize();
                const nextEuler = this.getEulerForMoveDirection(segmentDirection, currentEuler);

                chain = chain.to(Math.max(segmentDistance / moveSpeed, 0.04), {
                    position: nextPoint,
                    eulerAngles: nextEuler,
                }, { easing: 'quadInOut' });
                currentEuler = nextEuler.clone();
            }

            currentPoint = nextPoint.clone();
        }

        chain.call(() => {
            this.isMoving = false;
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


