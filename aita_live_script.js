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
            const response = await fetch(`top_aita_posts.json?v=${new Date().getTime()}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - Could not fetch JSON file.`);
            }
            let rawPostsData = await response.json();

            if (!rawPostsData || rawPostsData.length === 0) {
                 postsContainer.innerHTML = '<p>No post data found. Please generate/update the top_aita_posts.json file.</p>';
                 return;
            }

            // --- Pre-calculate Reddit percentages and ensure necessary fields exist ---
            loadedPostsData = rawPostsData.map(post => {
                const counts = post.reddit_judgments || {};
                const total = post.total_judged || 0;
                const percentages = {};
                const categories = ["YTA", "NTA", "ESH", "NAH", "INFO"];
                categories.forEach(cat => {
                    percentages[cat] = total > 0 ? ((counts[cat] || 0) / total) * 100 : 0;
                });
                const verdict = post.reddit_verdict || "Mixed"; // Ensure verdict exists

                return {
                    ...post,
                    reddit_percentages: percentages,
                    reddit_verdict: verdict,
                };
            });

            // Display timestamp
            if (loadedPostsData[0]?.fetched_utc) {
                 try { dataTimestampSpan.textContent = new Date(loadedPostsData[0].fetched_utc).toLocaleString(); }
                 catch (e) { dataTimestampSpan.textContent = "Unknown"; }
            } else { dataTimestampSpan.textContent = "Unknown"; }

            displayPosts();
            submitButton.style.display = 'block';

        } catch (error) {
            console.error('Error loading or processing post data:', error);
            postsContainer.innerHTML = `<p>Error loading posts: ${error.message}. Check browser console and verify 'top_aita_posts.json' exists and is valid JSON.</p>`;
        }
    }

    function displayPosts() {
        postsContainer.innerHTML = '';
        const judgmentTypes = ["YTA", "NTA", "ESH", "NAH", "INFO"];

        loadedPostsData.forEach((post) => {
            const postElement = document.createElement('div');
            postElement.className = 'live-post';
            postElement.setAttribute('data-post-id', post.id);

            const titleLink = `https://www.reddit.com${post.url}`;
            const titleHtml = `<h3><a href="${titleLink}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h3>`;
            const bodyHtml = `<div class="live-post-body">${escapeHtml(post.body_summary)}</div>`;

            let optionsHtml = '<div class="judgment-options">';
            const groupName = `judgment-${post.id}`;
            judgmentTypes.forEach(type => {
                 const radioId = `post-${post.id}-${type}`;
                 optionsHtml += `<label for="${radioId}"><input type="radio" name="${groupName}" id="${radioId}" value="${type}"><span>${type}</span></label>`;
            });
            optionsHtml += '</div>';

            postElement.innerHTML = titleHtml + bodyHtml + optionsHtml;
            postsContainer.appendChild(postElement);

            const radioButtons = postElement.querySelectorAll(`input[name="${groupName}"]`);
            radioButtons.forEach(radio => { radio.addEventListener('change', handleRadioChange); });
        });
    }

    function handleRadioChange(event) {
        const changedRadio = event.target;
        const groupName = changedRadio.name;
        const groupRadios = document.querySelectorAll(`input[name="${groupName}"]`);
        groupRadios.forEach(radio => {
            const label = radio.closest('label');
            if (label) {
                if (radio.checked) label.classList.add('label-selected');
                else label.classList.remove('label-selected');
            }
        });
    }

    // --- Handle Submission and Analysis ---
    submitButton.addEventListener('click', () => {
        let userJudgments = {};
        let answeredCount = 0;
        let agreementCount = 0;
        let totalPopularityPercent = 0;
        let userCategoryCounts = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0 };
        let redditCategoryTotals = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0, TotalJudged: 0 };
        let harshMismatches = 0;
        let softMismatches = 0;
        // No need for otherMismatches, it will be calculated

        loadedPostsData.forEach(post => {
            const selected = document.querySelector(`input[name="judgment-${post.id}"]:checked`);
            if (selected) {
                const userChoice = selected.value;
                userJudgments[post.id] = userChoice;
                answeredCount++;
                userCategoryCounts[userChoice]++;

                if (userChoice === post.reddit_verdict) {
                    agreementCount++;
                }

                if (post.reddit_percentages && post.reddit_percentages[userChoice] !== undefined) {
                    totalPopularityPercent += post.reddit_percentages[userChoice];
                }

                const judgments = post.reddit_judgments || {};
                for (const cat in redditCategoryTotals) {
                     if (cat !== 'TotalJudged' && judgments.hasOwnProperty(cat)) {
                        redditCategoryTotals[cat] += judgments[cat];
                     }
                }
                 redditCategoryTotals.TotalJudged += post.total_judged || 0;

                // Mismatch Severity Calculation
                const redditVerdict = post.reddit_verdict; // Already defaulted
                const userIsHarsh = ['YTA', 'ESH'].includes(userChoice);
                const userIsSoft = ['NTA', 'NAH'].includes(userChoice);
                const redditIsHarsh = ['YTA', 'ESH'].includes(redditVerdict);
                const redditIsSoft = ['NTA', 'NAH'].includes(redditVerdict);

                // Only count specific mismatches if verdict isn't INFO/Mixed
                if (userChoice !== redditVerdict) { // Only count if actual disagreement
                    if (userIsHarsh && redditIsSoft) {
                        harshMismatches++;
                    } else if (userIsSoft && redditIsHarsh) {
                        softMismatches++;
                    }
                    // Other types of mismatches will be calculated later
                }

            } else {
                userJudgments[post.id] = null;
            }
        });

        if (answeredCount === 0) {
            alert("Please judge at least one post before analyzing.");
            return;
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
                let comparisonText = Math.abs(diff) < 5 ? "similar to" : (diff > 0 ? `more often than` : `less often than`);
                resultsHtml += `<li><strong>${cat}:</strong> You (${userPercent.toFixed(1)}%) vs Reddit Avg (${redditAvgPercent.toFixed(1)}%) - You used this judgment <strong>${comparisonText}</strong> Reddit.</li>`;
            });
            resultsHtml += `</ul>`;
        } else {
             resultsHtml += `<p>Cannot calculate profile comparison (No posts judged or no Reddit judgments found in judged posts).</p>`;
        }

        // 4. Disagreement Style (Revised)
        resultsHtml += `<h4>Disagreement Style</h4>`;
        const disagreementCount = answeredCount - agreementCount;
        if (disagreementCount > 0) {
            const otherMismatches = disagreementCount - harshMismatches - softMismatches; // Calculate the remainder
            const harshMismatchRate = (harshMismatches / disagreementCount) * 100;
            const softMismatchRate = (softMismatches / disagreementCount) * 100;
            const otherMismatchRate = (otherMismatches / disagreementCount) * 100;

             resultsHtml += `<p>When you disagreed with the Reddit majority verdict (${disagreementCount} times):</p><ul>`;
             resultsHtml += `<li>You judged harsher (e.g., YTA/ESH when Reddit judged NTA/NAH) ${harshMismatches} times (${harshMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `<li>You judged softer (e.g., NTA/NAH when Reddit judged YTA/ESH) ${softMismatches} times (${softMismatchRate.toFixed(1)}%).</li>`;
             // Add the "Other" category
             resultsHtml += `<li>Other disagreements (e.g., involving INFO, Mixed, or YTA vs ESH) occurred ${otherMismatches} times (${otherMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `</ul>`;
        } else if (answeredCount > 0) {
             resultsHtml += `<p>You agreed with the Reddit majority verdict on all posts you judged!</p>`;
        } else {
             resultsHtml += `<p>No posts were judged.</p>`;
        }

        // 5. Overall Judgmental Tendency (Replaces Detailed Comparison)
        resultsHtml += `<h4>Overall Judgmental Tendency (vs. Reddit Majority Verdicts)</h4>`;
        // Calculate ratios (same as before, ensure counts exist for posts judged)
        let userYtaCount = userCategoryCounts['YTA'];
        let userNtaCount = userCategoryCounts['NTA'];
        const relevantRedditNtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'NTA').length;
        const relevantRedditYtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'YTA').length;

        const userRatio = (userNtaCount === 0) ? (userYtaCount > 0 ? Infinity : 0) : userYtaCount / userNtaCount;
        const redditMajorityRatio = (relevantRedditNtaCount === 0) ? (relevantRedditYtaCount > 0 ? Infinity : 0) : relevantRedditYtaCount / relevantRedditNtaCount;

        if (answeredCount > 0 && (userNtaCount > 0 || userYtaCount > 0)) {
            const relativeTendency = getRelativeJudgment(userRatio, redditMajorityRatio); // Use helper function
            resultsHtml += `<p>Based on your YTA/NTA ratio (${userRatio === Infinity ? '∞' : userRatio.toFixed(2)}) compared to the ratio derived from Reddit's majority verdicts for the posts you judged (${redditMajorityRatio === Infinity ? '∞' : redditMajorityRatio.toFixed(2)}), you appear <strong>${relativeTendency}</strong> judgmental.</p>`;
            resultsHtml += `<p><em>Note: This compares your YTA/NTA votes only to the *majority* outcome on Reddit for these specific posts.</em></p>`;
        } else {
            resultsHtml += `<p>Not enough YTA/NTA judgments provided by you or found in Reddit majority verdicts for a meaningful ratio comparison.</p>`;
        }

        // Display results
        resultsContentDiv.innerHTML = resultsHtml;
        resultsSummaryDiv.style.display = 'block';
        resultsSummaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });


    // --- Utility Functions ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
             console.warn("escapeHtml received non-string input:", unsafe);
             return '(Content missing or invalid)';
        }
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
}); // End of DOMContentLoaded listener