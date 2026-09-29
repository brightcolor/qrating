// Choices of a look go to the server one after the other, so the last click is the one the
// account keeps. A reading of the account taken before a later choice must not undo it, and
// only the newest choice speaks about its outcome.
export function createThemeQueue(save, initial = null) {
  let chain = Promise.resolve();
  let latest = 0;
  let pending = 0;
  let saved = initial;

  return {
    // The look the server confirmed last.
    get saved() {
      return saved;
    },
    // Taken before the account is read; `accepts` then says whether the reading still counts. A
    // reading that starts while a choice is on its way may carry the look from before it, so it
    // never counts, even when it answers after the choice has settled.
    mark: () => (pending ? -1 : latest),
    accepts: (mark) => mark === latest,
    confirm(value) {
      saved = value;
    },
    choose(id) {
      const ticket = ++latest;
      pending += 1;
      const request = chain.then(() => save(id));
      chain = request.catch(() => null);
      return request.then(
        (result) => {
          saved = result?.adminTheme ?? id;
          return { saved, newest: ticket === latest };
        },
        (error) => {
          throw Object.assign(error, { newest: ticket === latest, keptTheme: saved });
        }
      ).finally(() => {
        pending -= 1;
      });
    }
  };
}
