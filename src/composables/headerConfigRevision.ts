import { ref } from "vue";

// Bumped after Settings saves a change to the header's buttons or chips, so every cell asks for its
// header again instead of waiting for the window to regain focus — Settings is open in this same
// window, so that never comes.
export const headerConfigRevision = ref(0);
