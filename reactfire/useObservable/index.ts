import * as React from 'react';
import { Observable } from 'rxjs';
import { SuspenseSubject } from './SuspenseSubject';

const PRELOADED_OBSERVABLES = '_reactFirePreloadedObservables';
const DEFAULT_TIMEOUT = 30_000;

// Since we're side-effect free, we need to ensure our observable cache is global
const preloadedObservables: Map<string, SuspenseSubject<unknown>> = globalThis[PRELOADED_OBSERVABLES] || new Map();

if (!globalThis[PRELOADED_OBSERVABLES]) {
  globalThis[PRELOADED_OBSERVABLES] = preloadedObservables;
}

// Starts listening to an Observable.
// Call this once you know you're going to render a
// child that will consume the observable
export function preloadObservable<T>(source: Observable<T>, id: string) {
  if (preloadedObservables.has(id)) {
    return preloadedObservables.get(id) as SuspenseSubject<T>;
  } else {
    const observable = new SuspenseSubject(source, DEFAULT_TIMEOUT);
    preloadedObservables.set(id, observable);
    return observable;
  }
}

interface ObservableStatus<T> {
  status: 'loading' | 'error' | 'success';
  hasEmitted: boolean;
  isComplete: boolean;
  data: T;
  error: Error | undefined;
  firstValuePromise: Promise<void>;
}

export function useObservable<T>(
  observableId: string,
  source: Observable<T | any>,
  config: { initialData?: T | any; suspense?: boolean } = {}
): ObservableStatus<T> {
  if (!observableId) {
    throw new Error('cannot call useObservable without an observableId');
  }
  const observable = preloadObservable(source, observableId);

  const hasInitialData = Object.keys(config).includes('initialData');
  const suspenseEnabled = !!config.suspense;

  if (!observable.hasValue && !config?.initialData) {
    if (suspenseEnabled === true) {
      throw observable.firstEmission;
    }
  }

  const [latest, setValue] = React.useState(() => (observable.hasValue ? observable.value : config.initialData));
  React.useEffect(() => {
    const subscription = observable.subscribe(
      v => {
        setValue(() => v);
      },
      e => {
        throw e;
      }
    );
    return () => subscription.unsubscribe();
  }, [observableId]);

  let status;

  if (observable.hasError) {
    status = 'error';
  } else if (observable.hasValue || hasInitialData) {
    status = 'success';
  } else {
    status = 'loading';
  }

  return {
    status,
    hasEmitted: observable.hasValue,
    isComplete: observable.isStopped,
    data: latest,
    error: observable.ourError,
    firstValuePromise: observable.firstEmission
  };
}
