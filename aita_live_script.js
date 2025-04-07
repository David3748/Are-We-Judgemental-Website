document.addEventListener('DOMContentLoaded', () => {
    const postsContainer = document.getElementById('live-posts-container');
    const submitButton = document.getElementById('submit-live-judgments');
    const resultsSummaryDiv = document.getElementById('live-results-summary');
    const resultsContentDiv = document.getElementById('results-content');
    const dataTimestampSpan = document.getElementById('data-last-updated');

    let loadedPostsData = []; // Store the fetched post data with calculations

    // --- Fetch and Display Posts ---
    async function loadPosts() {
        try {
            // Add cache-busting query parameter to ensure fresh data
            const response = await fetch(`top_aita_posts.json?v=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - Could not fetch JSON file.`);
            }
            let rawPostsData = await response.json(); // Load raw data

            if (!rawPostsData || rawPostsData.length === 0) {
                 postsContainer.innerHTML = '<p>No post data found. Please generate/update the top_aita_posts.json file.</p>';
                 return;
            }

            // --- Pre-calculate Reddit percentages and ensure necessary fields exist ---
            loadedPostsData = rawPostsData.map(post => {
                const counts = post.reddit_judgments || {}; // Ensure counts is an object
                const total = post.total_judged || 0; // Use the explicit total_judged from JSON
                const percentages = {};
                const categories = ["YTA", "NTA", "ESH", "NAH", "INFO"];

                categories.forEach(cat => {
                    // Access judgments from the nested counts object
                    percentages[cat] = total > 0 ? ((counts[cat] || 0) / total) * 100 : 0;
                });

                // Ensure reddit_verdict exists, default to "Mixed" if not provided or null
                const verdict = post.reddit_verdict || "Mixed";

                return {
                    ...post, // Keep original data
                    reddit_percentages: percentages, // Add calculated percentages
                    reddit_verdict: verdict, // Ensure verdict exists
                    // total_judged should already be present from Python script
                };
            });
            // --- End Pre-calculation ---


            // Display timestamp
            if (loadedPostsData[0]?.fetched_utc) { // Optional chaining
                 try { dataTimestampSpan.textContent = new Date(loadedPostsData[0].fetched_utc).toLocaleString(); }
                 catch (e) { dataTimestampSpan.textContent = "Unknown"; }
            } else { dataTimestampSpan.textContent = "Unknown"; }

            displayPosts(); // Uses the processed loadedPostsData
            submitButton.style.display = 'block'; // Show button once posts are loaded

        } catch (error) {
            console.error('Error loading or processing post data:', error);
            postsContainer.innerHTML = `<p>Error loading posts: ${error.message}. Check browser console and verify 'top_aita_posts.json' exists and is valid JSON.</p>`;
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
            // Escape title and body summary
            const titleHtml = `<h3><a href="${titleLink}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h3>`;
            const bodyHtml = `<div class="live-post-body">${escapeHtml(post.body_summary)}</div>`;

            let optionsHtml = '<div class="judgment-options">';
            const groupName = `judgment-${post.id}`;

            judgmentTypes.forEach(type => {
                 const radioId = `post-${post.id}-${type}`;
                 // Label wraps input and span
                 optionsHtml += `
                    <label for="${radioId}">
                        <input type="radio" name="${groupName}" id="${radioId}" value="${type}">
                        <span>${type}</span>
                    </label>`;
            });
            optionsHtml += '</div>'; // Close judgment-options

            postElement.innerHTML = titleHtml + bodyHtml + optionsHtml;
            postsContainer.appendChild(postElement);

            // Add event listeners for label selection styling
            const radioButtons = postElement.querySelectorAll(`input[name="${groupName}"]`);
            radioButtons.forEach(radio => {
                radio.addEventListener('change', handleRadioChange);
            });
        });
    }

    // Event handler for radio button changes (label styling)
     function handleRadioChange(event) {
        const changedRadio = event.target;
        const groupName = changedRadio.name;
        const groupRadios = document.querySelectorAll(`input[name="${groupName}"]`); // Renamed variable for clarity

        groupRadios.forEach(radio => {
            // Find the parent label of this radio button using closest()
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


    // --- Handle Submission and Analysis ---
    submitButton.addEventListener('click', () => {
        // --- Start of Correct Analysis Logic ---
        let userJudgments = {};
        let answeredCount = 0;
        let agreementCount = 0; // Agreement with majority verdict
        let totalPopularityPercent = 0; // Sum of Reddit % for user's choices
        let userCategoryCounts = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0 };
        let redditCategoryTotals = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0, TotalJudged: 0 }; // Sum counts across *judged* posts
        let harshMismatches = 0; // User YTA/ESH when Reddit NTA/NAH
        let softMismatches = 0; // User NTA/NAH when Reddit YTA/ESH

        // Collect judgments and calculate initial stats
        loadedPostsData.forEach(post => {
            const selected = document.querySelector(`input[name="judgment-${post.id}"]:checked`);
            if (selected) {
                const userChoice = selected.value;
                userJudgments[post.id] = userChoice;
                answeredCount++;
                userCategoryCounts[userChoice]++; // Tally user's choice category

                // Agreement with majority (using the pre-processed verdict)
                if (userChoice === post.reddit_verdict) {
                    agreementCount++;
                }

                // Popularity Alignment: Add the % of redditors who agreed with the user's specific choice
                // Use the pre-calculated reddit_percentages
                if (post.reddit_percentages && post.reddit_percentages[userChoice] !== undefined) {
                    totalPopularityPercent += post.reddit_percentages[userChoice];
                } else {
                    // This case should be rare now due to pre-calculation, but good to have a warning
                    console.warn(`Missing Reddit percentage for choice ${userChoice} on post ${post.id}`);
                }

                // Accumulate Reddit counts for *judged* posts for profile comparison
                // Ensure reddit_judgments exists
                const judgments = post.reddit_judgments || {};
                for (const cat in redditCategoryTotals) {
                     // Check if the key exists in judgments before adding
                     if (cat !== 'TotalJudged' && judgments.hasOwnProperty(cat)) {
                        redditCategoryTotals[cat] += judgments[cat];
                     }
                }
                // Ensure total_judged exists and add it
                 redditCategoryTotals.TotalJudged += post.total_judged || 0;


                // Mismatch Severity (Simplified)
                const redditVerdict = post.reddit_verdict; // Already defaulted to "Mixed" in pre-calc
                const userIsHarsh = ['YTA', 'ESH'].includes(userChoice);
                const userIsSoft = ['NTA', 'NAH'].includes(userChoice);
                const redditIsHarsh = ['YTA', 'ESH'].includes(redditVerdict);
                const redditIsSoft = ['NTA', 'NAH'].includes(redditVerdict);

                // Only count mismatches if reddit verdict is clearly harsh/soft
                if (userIsHarsh && redditIsSoft) {
                    harshMismatches++;
                } else if (userIsSoft && redditIsHarsh) {
                    softMismatches++;
                }

            } else {
                userJudgments[post.id] = null; // Mark as unanswered
            }
        });

        if (answeredCount === 0) {
            alert("Please judge at least one post before analyzing.");
            return; // Exit if nothing was answered
        }

        // --- Generate Results HTML ---
        let resultsHtml = `<p>You judged ${answeredCount} out of ${loadedPostsData.length} available posts.</p>`;

        // 1. Agreement Score
        const agreementPercentage = (answeredCount > 0) ? (agreementCount / answeredCount) * 100 : 0;
        resultsHtml += `<h4>Verdict Agreement</h4>`;
        resultsHtml += `<p>You agreed with the Reddit majority verdict on <strong>${agreementCount} (${agreementPercentage.toFixed(1)}%)</strong> of the posts you judged.</p>`;

        // 2. Popularity Alignment
        const averagePopularityAlignment = (answeredCount > 0) ? totalPopularityPercent / answeredCount : 0;
        resultsHtml += `<h4>Popularity Alignment</h4>`;
        resultsHtml += `<p>On average, your specific judgment matched the opinion of <strong>${averagePopularityAlignment.toFixed(1)}%</strong> of Reddit commenters on the posts you judged.`;
        if (averagePopularityAlignment > 60) resultsHtml += ` (You generally align with popular opinions!)`;
        else if (averagePopularityAlignment < 30) resultsHtml += ` (You often hold minority opinions relative to Reddit!)`;
        else resultsHtml += ` (Your alignment with popular opinions is moderate.)`;
        resultsHtml += `</p>`;

        // 3. Judgment Profile Comparison
        resultsHtml += `<h4>Your Judgment Profile</h4>`;
        if (answeredCount > 0 && redditCategoryTotals.TotalJudged > 0) {
            resultsHtml += `<p>How frequently you used each judgment category compared to the average Reddit distribution for the posts you judged:</p><ul>`;
            const categories = ["YTA", "NTA", "ESH", "NAH", "INFO"];
            categories.forEach(cat => {
                const userPercent = (userCategoryCounts[cat] / answeredCount) * 100;
                const redditAvgPercent = (redditCategoryTotals[cat] / redditCategoryTotals.TotalJudged) * 100;
                const diff = userPercent - redditAvgPercent;
                let comparisonText = "";
                if (Math.abs(diff) < 5) comparisonText = "similar to"; // Threshold for "similar"
                else if (diff > 0) comparisonText = `more often than`;
                else comparisonText = `less often than`;

                resultsHtml += `<li><strong>${cat}:</strong> You (${userPercent.toFixed(1)}%) vs Reddit Avg (${redditAvgPercent.toFixed(1)}%) - You used this judgment <strong>${comparisonText}</strong> Reddit.</li>`;
            });
            resultsHtml += `</ul>`;
        } else {
             resultsHtml += `<p>Cannot calculate profile comparison (No posts judged or no Reddit judgments found in judged posts).</p>`;
        }

        // 4. Consensus Mismatch Type
        resultsHtml += `<h4>Disagreement Style</h4>`;
        const disagreementCount = answeredCount - agreementCount;
        if (disagreementCount > 0) {
            const harshMismatchRate = (harshMismatches / disagreementCount) * 100;
            const softMismatchRate = (softMismatches / disagreementCount) * 100;
             resultsHtml += `<p>When you disagreed with the Reddit majority verdict (${disagreementCount} times):</p><ul>`;
             resultsHtml += `<li>You judged harsher (YTA/ESH when Reddit judged NTA/NAH) ${harshMismatches} times (${harshMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `<li>You judged softer (NTA/NAH when Reddit judged YTA/ESH) ${softMismatches} times (${softMismatchRate.toFixed(1)}%).</li>`;
             // Note: The remainder would be disagreements involving INFO or Mixed verdicts, or ESH vs YTA etc.
             resultsHtml += `</ul>`;
        } else if (answeredCount > 0) {
             resultsHtml += `<p>You agreed with the Reddit majority verdict on all posts you judged!</p>`;
        } else {
             // This case should be prevented by the check at the start, but good for completeness
             resultsHtml += `<p>No posts were judged.</p>`;
        }


        // (Optional: Keep or remove the detailed breakdown)
        resultsHtml += `<h4>Detailed Comparison (First 5 Judged):</h4><ul>`;
        let detailCount = 0;
        for(const post of loadedPostsData) {
            if (userJudgments[post.id] && detailCount < 5) {
                 resultsHtml += `<li><strong>"${escapeHtml(post.title.substring(0,40))}..."</strong><br>`;
                 resultsHtml += `   Your Judgment: ${userJudgments[post.id]} | Reddit Verdict: ${post.reddit_verdict} `;
                 resultsHtml += userJudgments[post.id] === post.reddit_verdict ? ` <span style="color: green;">(Match!)</span>` : ` <span style="color: orange;">(Differs)</span>`;
                 resultsHtml += `</li>`;
                 detailCount++;
            }
        }
         if (answeredCount > detailCount && detailCount > 0) { // Add only if there are more *and* we showed some details
             resultsHtml += `<li>... and ${answeredCount - detailCount} more.</li>`
         } else if (detailCount === 0 && answeredCount > 0) {
             resultsHtml += `<li>No details to show for the first few (check filtering if posts were judged).</li>`
         } else if (answeredCount === 0) {
             // Already handled, but defensive
             resultsHtml += `<li>No posts judged.</li>`
         }
        resultsHtml += `</ul>`;


        // Display results
        resultsContentDiv.innerHTML = resultsHtml;
        resultsSummaryDiv.style.display = 'block';
        resultsSummaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // --- End of Correct Analysis Logic ---
    });


    // --- Utility Functions ---
    function escapeHtml(unsafe) {
        // Check if input is a string
        if (typeof unsafe !== 'string') {
            // Provide a default value or placeholder if not a string
             console.warn("escapeHtml received non-string input:", unsafe); // Log warning
             return '(Content missing or invalid)';
        }
        return unsafe
             .replace(/&/g, "&")
             .replace(/</g, "<")
             .replace(/>/g, ">")
             .replace(/"/g, "\"")
             .replace(/'/g, "'");
     }

     // Helper for ratio comparison (if needed, e.g., for future additions)
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
}); // End of DOMContentLoaded listener