/*
    Written by Levan Roinishvili levanroinishvili@fincore.com

    SimpleCache is similar to a Map.
    It will use any "uncomplicated" value as a key, and will map it to value of any type.

    SimpleCache will hash its "uncomplicated" keys, so that another "similar" "uncomplicated" value
    will have the same hash and thus map to the same entry.

    "Uncomplicated" value is a string, number, boolean or object with string keys and "uncomplicated" property values
    Two "uncomplicated" objects are "similar" if they are exactly the same, exept for the order of properties.
*/

type SimpleKeyBase = number | string | boolean | {
    [key: string]: SimpleKeyBase;
};

interface KeyAndPass<SimpleKeyType extends SimpleKeyBase, PassType> {
    key: SimpleKeyType;
    pass?: PassType;
}

interface HashAndPass<PassType> {
    keyHashed: string;
    pass?: PassType;
}

interface ArchiveEntry<AssetType, PassType> {
    asset: AssetType;
    lock: HashAndPass<PassType>;
}

export class SimpleCache<AssetType = any, KeyType extends SimpleKeyBase = SimpleKeyBase, PassType = any> {

    private archive: ArchiveEntry<AssetType, PassType>[] = [];

    /** Returns simple hash of a value, usable as a key. If value is not "uncomplicated", returns null */
    simpleHashSafe(item: KeyType) {
        try {
            return this.simpleHash(item);
        } catch (e) {
            return null;
        }
    }

    /** Returns simple hash of a key value. The value must be "uncomplicated", otherwise throws an error */
    simpleHash(item: KeyType): string {
        if ( item === undefined || item === null ) { return ''; }
        switch ( typeof item ) {
            case 'string': return escape(item);
            case 'number': return String(item);
            case 'boolean': return String(item);
            case 'object': return Object.keys(item).length ?
                '{' + Object.entries(item)
                    // .filter(([, value]) => ['string', 'number', 'object', 'undefined'].includes(typeof value))
                    .filter(([, value]) => value !== undefined && value !== null && (value !== 'object' || Object.keys[value]) )
                    .sort(([key1], [key2]) => key1 !== key2 ? key1 < key2 ? -1 : 1 : 0)
                    .map(([key, value]) => escape(key) + ':' + this.simpleHash(value)).join('|') +
                '}'
                : '';
            default: throw new Error('Cannot build hash for item of type ' + typeof item);
        }
    }

    private findEntryIndexByLock(lock: HashAndPass<PassType>) {
        const pass = lock.pass === undefined ? null : lock.pass;
        return this.archive.findIndex(entry =>
            entry.lock.keyHashed === lock.keyHashed && entry.lock.pass === pass
        );
    }

    removeAssetByLock(lock: HashAndPass<PassType>) {
        const index = this.findEntryIndexByLock(lock);
        if ( index === -1 ) {
            return undefined;
        } else {
            return this.archive.splice(index, 1)[0].asset;
        }
    }

    replaceAssetByLock(asset: AssetType, lock: HashAndPass<PassType>) {
        const index = this.findEntryIndexByLock(lock);
        const newEntry = {asset, lock};
        if ( index === -1 ) {
            this.archive.unshift(newEntry);
        } else {
            this.archive.splice(index, 1, newEntry);
        }
    }

    private safeLock(lock: HashAndPass<PassType>): HashAndPass<PassType> {
        return {
            keyHashed: lock.keyHashed,
            pass: lock.pass === undefined ? null : lock.pass
        };
    }

    /** Add or update cache entry by providing already hashed key and its mapped value
     *  For efficiency, will not check if entry with this lock already exists
     * @param keyItem an uncomplicated value, which - after hashing - will serve as the key
     * @param entry value to be stored in the cache
     */
    blindlyAddAssetByLock(asset: AssetType, lock: HashAndPass<PassType>) {
        this.archive.unshift({asset, lock: this.safeLock(lock)});
    }

    blindlyAddAssetByLockRaw(asset: AssetType, key: KeyType, pass: PassType) {
        const lock = this.safeLock({
            keyHashed: this.simpleHash(key),
            pass
        });
        this.archive.unshift({asset, lock});
    }

    /** Get entry from cache by providing Simple Hash key for the entry.
     *  If the Simple Hash key does not exist, will return undefined.
     */
    getAssetByHashAndPass(keyHashed: string, pass: PassType) {
        const entry = this.archive[this.findEntryIndexByLock({keyHashed, pass})];
        return entry ? entry.asset : undefined;
    }

    /**
     * Get entry from cache by providing Item key for the entry.
     * If the Item key does not exist, will return undefined.
     * If the Item is not an "uncomplicated" value, will throw an error
     */
    getAssetByKeyAndPass(key: KeyType, pass: PassType) {
        return this.getAssetByHashAndPass(this.simpleHash(key), pass);
    }
}
