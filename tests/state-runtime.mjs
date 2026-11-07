export function bindState(ApplicationState, env) {
  const values = new Map();
  let alarm = null;
  const make = (map) => ({
    get: async key => structuredClone(map.get(key)),
    put: async (key, value) => { map.set(key, structuredClone(value)); },
    delete: async key => map.delete(key),
    list: async ({prefix}) => new Map([...map].filter(([key]) => key.startsWith(prefix))),
    getAlarm: async () => alarm,
    setAlarm: async at => { alarm = at; },
    transaction: async callback => {
      const copy = new Map(structuredClone([...map]));
      const result = await callback(make(copy));
      map.clear(); for (const [key, value] of copy) map.set(key, value);
      return result;
    },
  });
  const storage = make(values);
  const instance = new ApplicationState({storage}, env);
  env.STATE = {idFromName: name => name, get: () => instance};
  return {values, instance, storage, read: key => values.get(`data:${key}`)?.value};
}
