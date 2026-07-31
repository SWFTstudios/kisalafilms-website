(() => {
  const cfg = window.KisalaFirebaseConfig;
  if (!cfg || !cfg.apiKey) {
    console.warn("Firebase config missing");
    return;
  }

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

  /** @type {Promise<{auth: any, db: any}> | null} */
  let ready = null;

  async function boot() {
    if (ready) return ready;
    ready = (async () => {
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js");
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      return { auth: firebase.auth(), db: firebase.firestore() };
    })();
    return ready;
  }

  window.KisalaAuth = {
    boot,
    async currentUser() {
      const { auth } = await boot();
      return auth.currentUser;
    },
    onAuth(cb) {
      boot().then(({ auth }) => auth.onAuthStateChanged(cb));
    },
    async signUp(email, password, displayName) {
      const { auth, db } = await boot();
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      if (displayName) {
        await cred.user.updateProfile({ displayName });
      }
      await db.collection("customers").doc(cred.user.uid).set(
        {
          email,
          displayName: displayName || "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          founderEligible: true,
        },
        { merge: true }
      );
      return cred.user;
    },
    async signIn(email, password) {
      const { auth } = await boot();
      const cred = await auth.signInWithEmailAndPassword(email, password);
      return cred.user;
    },
    async signOut() {
      const { auth } = await boot();
      await auth.signOut();
    },
    async ensureCustomerDoc(user) {
      if (!user) return;
      const { db } = await boot();
      await db.collection("customers").doc(user.uid).set(
        {
          email: user.email || "",
          displayName: user.displayName || "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    },
    async pullBuilds(uid) {
      const { db } = await boot();
      const snap = await db.collection("customers").doc(uid).collection("builds").get();
      const setups = {};
      snap.forEach((doc) => {
        setups[doc.id] = { id: doc.id, ...(doc.data() || {}) };
      });
      return setups;
    },
    async pushBuild(uid, buildId, payload) {
      const { db } = await boot();
      await db
        .collection("customers")
        .doc(uid)
        .collection("builds")
        .doc(buildId)
        .set(
          {
            ...payload,
            updatedAt: Date.now(),
            cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    },
    async deleteBuild(uid, buildId) {
      const { db } = await boot();
      await db.collection("customers").doc(uid).collection("builds").doc(buildId).delete();
    },
    async pullProjects(uid) {
      const { db } = await boot();
      const snap = await db.collection("customers").doc(uid).collection("projects").get();
      const projects = {};
      snap.forEach((doc) => {
        projects[doc.id] = { id: doc.id, ...(doc.data() || {}) };
      });
      return projects;
    },
    async pushProject(uid, projectId, payload) {
      const { db } = await boot();
      await db
        .collection("customers")
        .doc(uid)
        .collection("projects")
        .doc(projectId)
        .set(
          {
            ...payload,
            updatedAt: Date.now(),
            cloudUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    },
    async deleteProject(uid, projectId) {
      const { db } = await boot();
      await db.collection("customers").doc(uid).collection("projects").doc(projectId).delete();
    },
  };
})();
