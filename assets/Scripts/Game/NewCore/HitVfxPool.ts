import { instantiate, Node, Prefab } from 'cc';

export class HitVfxPool {
    private static prefab: Prefab = null;
    private static parent: Node = null;
    private static available: Node[] = [];

    public static initialize(prefab: Prefab, parent: Node): void {
        this.prefab = prefab;
        this.parent = parent;
        this.available.length = 0;
    }

    public static spawn(): Node {
        if (!this.prefab || !this.parent) {
            return null;
        }

        const vfx = this.available.pop() || instantiate(this.prefab);
        vfx.setParent(this.parent);
        vfx.active = true;
        return vfx;
    }

    public static release(vfx: Node): void {
        if (!vfx) {
            return;
        }

        vfx.active = false;
        vfx.removeFromParent();
        this.available.push(vfx);
    }
}
