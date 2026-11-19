// Undo/redo stack of serialized states.
export class StateHistory {
    private past: string[] = [];
    private future: string[] = [];
    private current: string;
    private limit: number;

    constructor(initial: string, limit = 100) {
        this.current = initial;
        this.limit = limit;
    }

    // Records a new state. Identical consecutive states are ignored; a new state clears the redo stack.
    commit(state: string) {
        if (state === this.current) {
            return;
        }
        this.past.push(this.current);
        if (this.past.length > this.limit) {
            this.past.shift();
        }
        this.future = [];
        this.current = state;
    }

    // Returns the state to restore, or null when there is nothing to undo.
    undo(): string | null {
        const previous = this.past.pop();
        if (previous === undefined) {
            return null;
        }
        this.future.push(this.current);
        this.current = previous;
        return previous;
    }

    // Returns the state to restore, or null when there is nothing to redo.
    redo(): string | null {
        const next = this.future.pop();
        if (next === undefined) {
            return null;
        }
        this.past.push(this.current);
        this.current = next;
        return next;
    }
}
