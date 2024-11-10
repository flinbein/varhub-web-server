export class TempMap<K, V> extends Map<K, V> {
	readonly #timerMap = new Map<K, ReturnType<typeof setTimeout>>();
	readonly #time;
	
	constructor(time: number) {
		super();
		this.#time = time;
	}
	
	set(key: K, value: V): this {
		clearTimeout(this.#timerMap.get(key));
		this.#timerMap.set(key, setTimeout(() => {
			this.#timerMap.delete(key);
			this.delete(key);
		}, this.#time));
		return super.set(key, value);
	}
	
	clear() {
		for (let timeout of this.#timerMap.values()) {
			clearTimeout(timeout);
		}
		this.#timerMap.clear();
		return super.clear();
	}
	
	
	delete(key: K): boolean {
		this.#timerMap.delete(key);
		return super.delete(key);
	}
}