export function deepEqual(left: unknown, right: unknown, depth: number = -1, strict?: boolean): boolean {
    if (left === right) {
        return true;
    }

    const shouldDig = depth > 0 || depth < 0;

    if (left && right && typeof left == 'object' && typeof right == 'object') {
        if (strict && left !== right) {
            return false;
        }
        if (left!.constructor !== right!.constructor) return false;
        if (Array.isArray(left)) {
            if (!Array.isArray(right)) {
                return false;
            }
            if (shouldDig) {
                const length = left.length;
                if (length !== right.length) {
                    return false;
                }
                for (let i = 0; i < length; i++) {
                    if (!deepEqual(left[i], right[i], depth - 1)) {
                        return false;
                    }
                }
            }
            return true;
        }

        // if (ArrayBuffer.isView(left)) {
        //     if (!ArrayBuffer.isView(right)) {
        //         return false;
        //     }
        //     const length = left.byteLength / left.byteOffset;
        //     if (length != right.byteLength / right.byteOffset) return false;
        //     for (let i = 0; i < length; i++) {
        //         if (!deepCompare(left[i], right[i], depth - 1)) {
        //             return false;
        //         }
        //     }
        //     return true;
        // }

        if (left!.constructor === RegExp) {
            // @ts-ignore
            return left!.source === right!.source && left!.flags === right!.flags;
        }
        if (left!.valueOf !== Object.prototype.valueOf) {
            return left!.valueOf() === right!.valueOf();
        }
        if (left!.toString !== Object.prototype.toString) {
            return left!.toString() === right!.toString();
        }

        if (shouldDig) {
            const keys = Object.keys(left!);
            const length = keys.length;
            if (length !== Object.keys(right!).length) {
                return false;
            }
      
            // Check first that all keys exist
            for (let i = 0; i < length; i++) {
                if (!Object.prototype.hasOwnProperty.call(right, keys[i])) {
                    return false;
                }
            }
    
            for (let i = 0; i < length; i++) {
                const key = keys[i];
                // @ts-ignore
                if (!deepEqual(left![key], right![key], depth - 1)) {
                    return false;
                }
            }
        }
        return true;
    }

    return false;
}
