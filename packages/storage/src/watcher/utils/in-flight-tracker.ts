export type InFlightTracker = {
  enter: () => void;
  exit: () => void;
  wait: () => Promise<void>;
  count: () => number;
};

export const createInFlightTracker = (): InFlightTracker => {
  let count = 0;
  let resolvers: Array<() => void> = [];

  const resolveAll = () => {
    if (resolvers.length === 0) return;
    const pending = resolvers;
    resolvers = [];
    for (const resolve of pending) resolve();
  };

  return {
    enter() {
      count++;
    },
    exit() {
      if (count > 0) count--;
      if (count === 0) resolveAll();
    },
    wait() {
      if (count === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        resolvers.push(resolve);
      });
    },
    count() {
      return count;
    },
  };
};
