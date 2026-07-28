export class DisclosureState {
  private readonly expandedIds = new Set<string>();

  isExpanded(id: string): boolean {
    return this.expandedIds.has(id);
  }

  toggle(id: string): boolean {
    if (this.expandedIds.has(id)) {
      this.expandedIds.delete(id);
      return false;
    }
    this.expandedIds.add(id);
    return true;
  }

  retain(ids: readonly string[]): void {
    const retained = new Set(ids);
    for (const id of this.expandedIds) {
      if (!retained.has(id)) {
        this.expandedIds.delete(id);
      }
    }
  }
}
