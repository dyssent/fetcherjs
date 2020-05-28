# Introduction

---

FetcherJS is a library for data fetching written in TypeScript. It is designed for React Hooks,
and provides a wide variety of options to tweak the behavior for optimal performance.

It is compatible with **any** Promise like request and can be used with REST, RPC, GraphQL,
or other Promise based fetchers.

Behind the scenes, there is a built in cache with [RFC-5861 Stale Content](https://tools.ietf.org/html/rfc5861)
support, which means all requests will be cached unless specified otherwise. Data is immediately
returned if available in cache, in case it is stale, a request will be sent to obtain fresh
data.

On top of cache, there is a requests manager, which is core to organizing requests in an optimal
pipeline. Manager provides means for prioritization, parallel fetching, storage processing, and more.

All of the code is well documented via JSDoc format, which is used to generate the documentation,
but also is displayed during coding in VS Code or other editors.

## Hooks

---

There are two main hooks provided: *useQuery* and *useMutation*. A set of utilitary hooks
is also available, but most functionality can be implemented using only useQuery and useMutation.

If you are not familiar with hooks, it is recommended to read hooks section at [react website](https://reactjs.org/docs/hooks-intro.html).

### useQuery

*useQuery* hook syntax:

```typescript
const { data, pending, error } = useQuery('movies', fetch, undefined, 'http://example.com/movies.json');
```

Let's break down this code and what is going to happen when executed this way:

First parameter is a key, which must be unique and used as a storage key in the cache. It can be a simple string,
or a composite object: ['movies'], ['movie', 1], {movie: 1}, and more nested if needed. This ensures
that you can pick the most appropriate way to represent a unique request that goes out. All keys get converted
to a string representation, and if multiple useQuery usages around a page point to the same key - only a single request
will be executed.

Second parameter is a fetcher function, the only requirement for it is to return a Promise. What exactly is going
to happen under the hood is not imporant for the useQuery hook itself. As a placeholder, you can provide direct
response ```() => new Promise(resolve => resolve(['movie'])``` and it will accepted. Important to notice that the
request function must not be a closure, as it will change on each render. Use a stable function, and if needed
wrap it in a useCallback hook. The reason for it being stable is simple - if a new request function is provided,
useQuery will assume something must have changed and it has to refetch it. This might get into an infinite re-fetching,
which is not good. useQuery has built in detection for this, and it will throw an error if it detects that unstable
request function is supplied.

Third parameter is optional and is an object representing request options. This is where priority, delays, TTLs, and
other variables can be tweaked.

Arguments following options are the arguments that will be passed to the fetcher function provided in the second
parameter. In the example above, the URL `http://example.com/movies.json` will be passed as an argument to function
fetch. [Fetch function](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) also accepts options,
they can be provided as fifth arguments, and so on. Everything following options - will be passed to the fetcher function.

#### Request State Anatomy

data: TODO
stale: TODO
pending: TODO
fetching: TODO
attempts: TODO
error: TODO

All of the requests end up in a request pipeline which is managed by a request manager. There are a few updates that
will happen to the component hosting the useQuery hook:

1. At first render, data will be undefined or filled in with the data available in cache

2. If cache data is available and not stale, this is going to be the only render initiated by the hook. Otherwise, a
   request will be added to the pending queue. If there are no limits to the parallel requests, it will also immediately
   transition to fetching state, which means the request has left the app and is currently going over the network
   (or whatever the implementation is of the promise based fetcher).

3. Once request is complete, either successfully or not, a hook will update the data and / or error accordingly.

There might be a few more variations to this, in case of specific options provided, but most use cases will fall into this
3 steps flow.

#### Query Callbacks

#### Query Batching

#### Query Examples

- Custom TTL set to 60 seconds, which means subsequent queries using the key movies will fallback into the existing
value in cache. After 60 seconds, the value is going to be refetched. It is important to notice that while an observer
is active (useQuery hook is being mounted), value will not be removed from cache. Once unmounted, if value is expired
then it will be cleaned up.

```typescript
const { data } = useQuery('movies', fetch, {ttl: 60}, 'http://example.com/movies.json')
```

- Retry policy is set to 5 with an exponential back-off. Retries set to 5 means that if a request fails, it will attempt
  in total 5 times before giving up. All this time a request will be either in pending or both pending + fetching
  states.

```typescript
const { data } = useQuery('movies', fetch, {retries: 5}, 'http://example.com/movies.json')
```

- Queries chaining

- Conditional fetching

- Manual fetching

- Validate

- Transform

- Equility

- Priority

- Delay

- Previous Value

- Refresh

- Mutate

- Hash

- Refresh: onFocus, onOnline, onInterval

- Suspense

- Lose and Strict arguments check

- Tags

### useMutation

---

*useMutation* hook syntax:

```typescript
const [savePost, {pending, error}] = useMutation(fetch, undefined, 'http://example.com/movies.json', {method: POST});
```

#### Mutation Callbacks

#### Mutation Examples

### useCacheValue

```typescript
Usage example
```

## Global Configuration

## TypeScript

Generic types definitions
Request params matching
Optional key and optional params

## SSR

## Advanced

### Cache rehydration

### Custom serialization
