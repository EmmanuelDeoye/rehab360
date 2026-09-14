// js/config.js - Firebase Configuration (Compat SDK v10+)

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCSeWPRUtxdmYUSqfE9qx44Xf-DRt4UvjI",
    authDomain: "rehablix-ai.firebaseapp.com",
    projectId: "rehablix-ai",
    storageBucket: "rehablix-ai.firebasestorage.app",
    messagingSenderId: "111840419014",
    appId: "1:111840419014:web:0fd17fa428a2b2bff14bc7",
    measurementId: "G-VF4FZ76Q46"
};

// Initialize Firebase
(function() {
    try {
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
        
        // Set auth persistence
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => {
                console.log('✅ Auth persistence enabled (LOCAL)');
            })
            .catch((error) => {
                console.error('Auth persistence error:', error);
            });
        
        // Monitor database connection
        const connectedRef = firebase.database().ref('.info/connected');
        connectedRef.on('value', (snap) => {
            if (snap.val() === true) {
                console.log('✅ Connected to Firebase Realtime Database');
            } else {
                console.log('❌ Disconnected from Firebase Realtime Database');
            }
        });
        
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
})();

// Function to fetch tokens from Firebase
async function fetchTokens() {
    try {
        const db = firebase.database();
        const snapshot = await db.ref('tokens/open_ai').once('value');
        const data = snapshot.val();
        
        if (data && data.api_key) {
            console.log('✅ Tokens fetched successfully');
            return {
                token: data.api_key,
                endpoint: 'https://api.openai.com/v1'
            };
        } else {
            console.error('❌ No token data found in Firebase');
            return null;
        }
    } catch (error) {
        console.error("❌ Credential Error:", error);
        return null;
    }
}

// Make fetchTokens available globally
window.fetchTokens = fetchTokens;

console.log('Firebase config loaded');
