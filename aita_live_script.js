document.addEventListener('DOMContentLoaded', () => {
    const postsContainer = document.getElementById('live-posts-container');
    const submitButton = document.getElementById('submit-live-judgments');
    const resultsSummaryDiv = document.getElementById('live-results-summary');
    const resultsContentDiv = document.getElementById('results-content');
    const dataTimestampSpan = document.getElementById('data-last-updated');

    let loadedPostsData = []; // Store the fetched post data

    // --- Fetch and Display Posts ---
    async function loadPosts() {
        try {
            const response = await fetch('top_aita_posts.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            loadedPostsData = await response.json();

            if (!loadedPostsData || loadedPostsData.length === 0) {
                 postsContainer.innerHTML = '<p>No post data found. Please generate the top_aita_posts.json file.</p>';
                 return;
            }

            // Display timestamp
            if (loadedPostsData[0]?.fetched_utc) { // Optional chaining
                 try {
                    dataTimestampSpan.textContent = new Date(loadedPostsData[0].fetched_utc).toLocaleString();
                 } catch (e) {
                    dataTimestampSpan.textContent = "Unknown";
                 }
            } else {
                dataTimestampSpan.textContent = "Unknown";
            }

            displayPosts(); // Now includes adding event listeners
            submitButton.style.display = 'block';

        } catch (error) {
            console.error('Error loading post data:', error);
            postsContainer.innerHTML = `<p>Error loading posts: ${error.message}. Make sure the 'top_aita_posts.json' file exists and is accessible.</p>`;
        }
    }

    function displayPosts() {
        postsContainer.innerHTML = ''; // Clear loading message
        const judgmentTypes = ["YTA", "NTA", "ESH", "NAH", "INFO"];

        loadedPostsData.forEach((post) => {
            const postElement = document.createElement('div');
            postElement.className = 'live-post';
            postElement.setAttribute('data-post-id', post.id);

            const titleLink = `https://www.reddit.com${post.url}`;
            const titleHtml = `<h3><a href="${titleLink}" target="_blank" rel="noopener noreferrer">${post.title}</a></h3>`;
            const bodyHtml = `<div class="live-post-body">${escapeHtml(post.body_summary)}</div>`;

            let optionsHtml = '<div class="judgment-options">';
            const groupName = `judgment-${post.id}`; // Name for the radio group

            judgmentTypes.forEach(type => {
                 const radioId = `post-${post.id}-${type}`;
                 // Note: The label now directly wraps the input and the span
                 optionsHtml += `
                    <label for="${radioId}">
                        <input type="radio" name="${groupName}" id="${radioId}" value="${type}">
                        <span>${type}</span>
                    </label>`;
            });
            optionsHtml += '</div>'; // Close judgment-options

            postElement.innerHTML = titleHtml + bodyHtml + optionsHtml;
            postsContainer.appendChild(postElement);

            // --- NEW: Add event listeners for this post's radio buttons ---
            const radioButtons = postElement.querySelectorAll(`input[name="${groupName}"]`);
            radioButtons.forEach(radio => {
                radio.addEventListener('change', handleRadioChange);
            });
            // --- End NEW ---
        });
    }

    // --- NEW: Event handler for radio button changes ---
    function handleRadioChange(event) {
        const changedRadio = event.target;
        const groupName = changedRadio.name;

        // Find all labels within the same group (same post)
        const groupLabels = document.querySelectorAll(`input[name="${groupName}"]`);

        groupLabels.forEach(radio => {
            // Find the parent label of this radio button
            // Use closest() which is robust
            const label = radio.closest('label');
            if (label) {
                if (radio.checked) {
                    label.classList.add('label-selected'); // Add class to the selected one
                } else {
                    label.classList.remove('label-selected'); // Remove from others
                }
            }
        });
    }
    // --- End NEW ---


    // --- Handle Submission and Analysis ---
    // (This function remains the same as before)
    submitButton.addEventListener('click', () => {
        let userJudgments = {};
        let answeredCount = 0;
        let agreementCount = 0;
        let userYtaCount = 0;
        let userNtaCount = 0;
        // Remove unused redditYtaCount/redditNtaCount or calculate correctly
        // let redditYtaCount = 0;
        // let redditNtaCount = 0;

        loadedPostsData.forEach(post => {
            const selected = document.querySelector(`input[name="judgment-${post.id}"]:checked`);
            if (selected) {
                userJudgments[post.id] = selected.value;
                answeredCount++;
                if (selected.value === post.reddit_verdict) { agreementCount++; }
                if (selected.value === 'YTA') userYtaCount++;
                if (selected.value === 'NTA') userNtaCount++;
                // if (post.reddit_verdict === 'YTA') redditYtaCount++; // Needed for comparison
                // if (post.reddit_verdict === 'NTA') redditNtaCount++; // Needed for comparison
            } else {
                userJudgments[post.id] = null;
            }
        });

        if (answeredCount === 0) {
            alert("Please judge at least one post before analyzing.");
            return;
        }

        let resultsHtml = `<p>You judged ${answeredCount} out of ${loadedPostsData.length} posts.</p>`;
        const agreementPercentage = (agreementCount / answeredCount) * 100;
        resultsHtml += `<p>You agreed with the Reddit majority verdict on <strong>${agreementCount} (${agreementPercentage.toFixed(1)}%)</strong> of the posts you judged.</p>`;

        const userRatio = (userNtaCount === 0) ? (userYtaCount > 0 ? Infinity : 0) : userYtaCount / userNtaCount;
        const relevantRedditNtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'NTA').length;
        const relevantRedditYtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'YTA').length;
        const redditMajorityRatio = (relevantRedditNtaCount === 0) ? (relevantRedditYtaCount > 0 ? Infinity : 0) : relevantRedditYtaCount / relevantRedditNtaCount;

        resultsHtml += `<h4>Overall Tendency (YTA/NTA Ratio):</h4>`;
        if (userNtaCount > 0 || userYtaCount > 0) {
             resultsHtml += `<p>Your YTA/NTA Ratio: ${userRatio === Infinity ? '∞' : userRatio.toFixed(2)}<br>`;
             resultsHtml += `Reddit Majority Verdict YTA/NTA Ratio (for posts you judged): ${redditMajorityRatio === Infinity ? '∞' : redditMajorityRatio.toFixed(2)}</p>`;
             const relativeJudgement = getRelativeJudgment(userRatio, redditMajorityRatio);
             resultsHtml += `<p>Compared to the Reddit majority verdicts on these specific posts, you seem <strong>${relativeJudgement}</strong> judgmental (based on YTA/NTA ratio).</p>`
        } else {
             resultsHtml += `<p>Not enough YTA/NTA judgments provided to calculate a meaningful ratio comparison.</p>`
        }

        resultsHtml += `<h4>Detailed Comparison (First ~5 Judged):</h4><ul>`;
        let detailCount = 0;
        for(const post of loadedPostsData) {
            if (userJudgments[post.id] && detailCount < 5) {
                 resultsHtml += `<li><strong>"${post.title.substring(0,40)}..."</strong><br>`;
                 resultsHtml += `   Your Judgment: ${userJudgments[post.id]} | Reddit Verdict: ${post.reddit_verdict} `;
                 resultsHtml += userJudgments[post.id] === post.reddit_verdict ? ` <span style="color: green;">(Match!)</span>` : ` <span style="color: orange;">(Differs)</span>`;
                 resultsHtml += `</li>`;
                 detailCount++;
            }
        }
         if (answeredCount > detailCount) {
             resultsHtml += `<li>... and ${answeredCount - detailCount} more.</li>`
         }
        resultsHtml += `</ul>`;

        resultsContentDiv.innerHTML = resultsHtml;
        resultsSummaryDiv.style.display = 'block';
        resultsSummaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });


    // --- Utility Functions ---
    // (escapeHtml and getRelativeJudgment remain the same)
      function escapeHtml(unsafe) {
          if (!unsafe) return '';
          return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "\"").replace(/'/g, "'");
      }
      function getRelativeJudgment(userRatio, groupRatio, tolerance = 0.20) {
          if (userRatio === Infinity) { return groupRatio === Infinity ? "similarly" : "more"; }
          if (groupRatio === Infinity) { return "less"; }
          if (groupRatio === 0) { return userRatio > 0 ? "more" : "similarly"; }
          if (userRatio > groupRatio * (1 + tolerance)) { return "more"; }
          else if (userRatio < groupRatio * (1 - tolerance)) { return "less"; }
          else { return "similarly"; }
     }

    // --- Initial Load ---
    loadPosts();
});