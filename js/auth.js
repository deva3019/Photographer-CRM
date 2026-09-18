// js/auth.js
import { app } from "./firebase-config.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const loginForm = document.getElementById("login-form");
const btnGoogle = document.getElementById("btn-google");
const errorBox = document.getElementById("auth-error");
const btnLogin = document.getElementById("btn-login");
const spinner = document.getElementById("login-spinner");
const loginText = document.getElementById("login-text");

// If already logged in, skip the login page and go to the CRM
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "dashboard.html";
  }
});

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove("hidden");
  btnLogin.disabled = false;
  spinner.classList.add("hidden");
  loginText.textContent = "Sign In securely";
}

// 1. Email/Password Login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.add("hidden");
  
  btnLogin.disabled = true;
  spinner.classList.remove("hidden");
  loginText.textContent = "Authenticating...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will handle the redirect
  } catch (error) {
    console.error(error.code);
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      showError("Incorrect email or password. Please try again.");
    } else {
      showError("Login failed. Please check your connection.");
    }
  }
});

// 2. Google Sign-In
btnGoogle.addEventListener("click", async () => {
  errorBox.classList.add("hidden");
  try {
    await signInWithPopup(auth, provider);
    // onAuthStateChanged will handle the redirect
  } catch (error) {
    console.error("Google Auth Error:", error);
    showError("Google Sign-In failed or was cancelled.");
  }
});