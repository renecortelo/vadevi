import { useCallback, useRef, useState } from "react";

/**
 * The next page of a list, appended. A list loaded again while a page is on its
 * way has moved on: `restart` says so, and that page is dropped rather than
 * added to a list it no longer follows.
 */
export function useLoadMore() {
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const restart = useCallback(() => {
    generation.current += 1;
  }, []);
  async function loadMore<Page>(fetchPage: () => Promise<Page>, append: (page: Page) => void) {
    if (loading) return;
    const mine = generation.current;
    setLoading(true);
    try {
      const page = await fetchPage();
      if (generation.current === mine) append(page);
    } catch {
      // What is on screen stays; the button is there for another try.
    } finally {
      setLoading(false);
    }
  }
  return { loading, loadMore, restart };
}
