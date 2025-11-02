const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🍪 FACEBOOK COOKIE EXTRACTION GUIDE\n');
console.log('=== QUICK STEPS ===');
console.log('1. Open Chrome/Firefox and go to facebook.com');
console.log('2. Press F12 for Developer Tools');
console.log('3. Go to: Application/Storage tab → Cookies → https://www.facebook.com');
console.log('4. Find and copy these cookie values:\n');

console.log('REQUIRED COOKIES:');
console.log('  - c_user     (Your User ID)');
console.log('  - xs         (Session Token - MOST IMPORTANT)');
console.log('  - fr         (Facebook Recognition)');
console.log('  - sb         (Browser ID)');
console.log('  - datr       (Device Recognition)\n');

console.log('=== EXTRACTION TIPS ===');
console.log('• Right-click on cookie → Copy Value');
console.log('• Make sure you\'re logged into Facebook');
console.log('• Cookies expire after ~2 months\n');

function createAppState() {
  const appState = [
    {
      key: "c_user",
      value: "61570207331676",
      domain: ".facebook.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 31536000,
      secure: true,
      httponly: false
    },
    {
      key: "xs", 
      value: "31%3A4Vx83rcd-fHrtA%3A2%3A1759858218%3A-1%3A-1",
      domain: ".facebook.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 31536000,
      secure: true,
      httponly: true
    },
    {
      key: "fr",
      value: "0b85llXAYkcHvHS2S.AWdg94bLGKlBJu5zc5ppHQoRClCAL_K-m20inhJdTA5hTAS87Gs.Bo5UsF..AAA.0.0.Bo5U8H.AWez7GkjnE200EmzrO4xMxmDEKY",
      domain: ".facebook.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 31536000,
      secure: true,
      httponly: true
    },
    {
      key: "sb",
      value: "VZxgaAu3sr9be1EBkjzCTl-m",
      domain: ".facebook.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 31536000,
      secure: true,
      httponly: true
    },
    {
      key: "datr",
      value: "VZxgaJwZLwmTo86-Mid66CQr",
      domain: ".facebook.com",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 31536000,
      secure: true,
      httponly: true
    }
  ];

  console.log('\n📝 Enter your cookie values (press Enter to skip optional ones):\n');
  
  function askCookieValue(index) {
    if (index >= appState.length) {
      // Validate required cookies
      const requiredCookies = appState.filter(cookie => 
        ['c_user', 'xs'].includes(cookie.key) && cookie.value
      );
      
      if (requiredCookies.length < 2) {
        console.log('\n❌ ERROR: c_user and xs cookies are REQUIRED!');
        console.log('Please restart and provide these essential cookies.');
        rl.close();
        return;
      }
      
      // Save the appstate
      fs.writeFileSync('appstate.json', JSON.stringify(appState, null, 2));
      console.log('\n✅ SUCCESS: appstate.json created!');
      console.log('🤖 You can now run: npm start');
      rl.close();
      return;
    }
    
    const cookie = appState[index];
    const isRequired = ['c_user', 'xs'].includes(cookie.key);
    
    rl.question(`${isRequired ? '🔴 REQUIRED' : '⚪ OPTIONAL'} - Enter "${cookie.key}": `, (value) => {
      if (value.trim()) {
        appState[index].value = value.trim();
        console.log(`   ✅ Saved`);
      } else if (isRequired) {
        console.log(`   ❌ This cookie is REQUIRED!`);
        askCookieValue(index); // Ask again for required cookies
        return;
      } else {
        console.log(`   ⚪ Skipped`);
      }
      askCookieValue(index + 1);
    });
  }
  
  askCookieValue(0);
}

createAppState();