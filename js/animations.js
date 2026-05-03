const LiveScoreAnimator = (function () {
  let liveScoreTween = null;
  let deltaTween = null;

  function getLiveScoreBox() {
    return document.getElementById("live-score-value");
  }

  function getDeltaBox() {
    return document.getElementById("live-score-delta");
  }

  function setLiveScoreText(value) {
    const box = getLiveScoreBox();
    if (!box) return;
    box.textContent = Number(value || 0).toFixed(2);
  }

  function renderLiveScoreDelta(delta, label = "") {
    const deltaBox = getDeltaBox();
    if (!deltaBox) return;

    // Kill previous animation
    if (deltaTween && typeof deltaTween.kill === "function") {
      deltaTween.kill();
    }

    deltaBox.className = "score-float";
    deltaBox.removeAttribute("data-label");
    deltaBox.style.opacity = "0";
    deltaBox.style.transform = "translateX(-50%) translateY(8px)";
    deltaBox.textContent = "";

    if (delta <= 0) return;

    deltaBox.style.minWidth = "110px";
    deltaBox.textContent = `+${Number(delta).toFixed(2)}`;

    let cls = "default";
    if (label === "CORE TAP") cls = "tap";
    else if (label === "ADS REWARD") cls = "ads";
    else if (label === "REF BONUS") cls = "ref";
    else if (label === "TON BUY") cls = "ton";
    else if (label === "STARS BUY") cls = "stars";

    deltaBox.className = `score-float ${cls}`;
    deltaBox.setAttribute("data-label", label);

    const delay = (label === "CORE TAP") ? 1.2 : 10;

    if (window.gsap && typeof window.gsap.set === "function" && typeof window.gsap.to === "function") {
      gsap.set(deltaBox, { opacity: 0, y: 8 });
      gsap.to(deltaBox, { opacity: 1, y: 0, duration: 0.3 });
      deltaTween = gsap.to(deltaBox, { opacity: 0, y: 8, duration: 0.3, delay: delay, onComplete: () => {
        deltaBox.textContent = "";
        deltaBox.removeAttribute("data-label");
      }});
    } else {
      deltaBox.style.opacity = "1";
      deltaBox.style.transform = "translateX(-50%) translateY(0)";

      setTimeout(() => {
        deltaBox.textContent = "";
        deltaBox.removeAttribute("data-label");
        deltaBox.style.opacity = "0";
        deltaBox.style.transform = "translateX(-50%) translateY(8px)";
      }, delay * 1000);
    }
  }

  function animateLiveScoreTo(targetScore, currentScore, duration = 0.55, onUpdate = null, onComplete = null) {
    const finalScore = Number(targetScore || 0);
    const startScore = Number(currentScore || 0);

    if (liveScoreTween && typeof liveScoreTween.kill === "function") {
      liveScoreTween.kill();
    }

    if (window.gsap && typeof window.gsap.to === "function") {
      const scoreObj = { value: startScore };
      liveScoreTween = gsap.to(scoreObj, {
        value: finalScore,
        duration,
        ease: "power2.out",
        onUpdate: () => {
          setLiveScoreText(scoreObj.value);
          if (typeof onUpdate === "function") {
            onUpdate(scoreObj.value);
          }
        },
        onComplete: () => {
          setLiveScoreText(finalScore);
          if (typeof onUpdate === "function") {
            onUpdate(finalScore);
          }
          if (typeof onComplete === "function") {
            onComplete(finalScore);
          }
        }
      });
    } else {
      setLiveScoreText(finalScore);
      if (typeof onUpdate === "function") {
        onUpdate(finalScore);
      }
      if (typeof onComplete === "function") {
        onComplete(finalScore);
      }
    }
  }

  return {
    renderLiveScoreDelta,
    animateLiveScoreTo,
    setLiveScoreText
  };
})();

window.LiveScoreAnimator = LiveScoreAnimator;
