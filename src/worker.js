export default {
  fetch(request, environment) {
    return environment.ASSETS.fetch(request);
  }
};
