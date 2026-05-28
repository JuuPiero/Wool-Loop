import { _decorator, CCString, Color, Prefab } from 'cc';
const { ccclass, property } = _decorator;
import { bh } from 'db://scriptable-asset/scriptable_runtime';
import { LevelDataSA } from './LevelDataSA';


@bh.createAssetMenu('LevelsConfig', 'Config/LevelsConfig')
@bh.scriptable('LevelsConfig')
export class LevelsConfig extends bh.ScriptableAsset {

    @property({type: LevelDataSA}) public levels: LevelDataSA[] = [];

    // Method to get level by index
    public getLevelByIndex(index: number): LevelDataSA | null {
        if (index >= 0 && index < this.levels.length) {
            return this.levels[index];
        }
        return null;
    }
} 