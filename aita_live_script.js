document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const postsContainer = document.getElementById('live-posts-container');
    const submitButton = document.getElementById('submit-live-judgments');
    const resultsSummaryDiv = document.getElementById('live-results-summary');
    const resultsContentDiv = document.getElementById('results-content');
    const dataTimestampSpan = document.getElementById('data-last-updated');

    // --- State Variables ---
    let loadedPostsData = [];
    let userToken = null; // Variable to hold the unique user token
    let hasSubmitted = false; // Flag to prevent multiple submissions

    // --- LocalStorage Key ---
    const USER_TOKEN_KEY = 'aitaUserToken';

    // --- Google Form Configuration (Populated from User HTML) ---
    const GOOGLE_FORM_ACTION_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfrN1KXhkWfHIaPZXlt1eBKomGf_G0YwsmMaKr2wMTbhIuhnw/formResponse";
    const ENTRY_IDS = {
        // NEW FIELD from form HTML:
        userToken: "entry.1891712537",        // Corresponds to "UserToken" question

        // IDs from previous correct extraction (based on your form structure):
        postID: "entry.1279077345",         // Corresponds to "PostID" question
        userJudgment: "entry.522832524",    // Corresponds to "UserJudgment" question
        redditVerdict: "entry.2085620116",  // Corresponds to "RedditVerdict" question
        agreed: "entry.1129841342",         // Corresponds to "AgreedWithMajority" question
        userYTA_count: "entry.819958711",   // Corresponds to "UserYTA" question
        userNTA_count: "entry.1159463763",  // Corresponds to "UserNTA" question
        userESH_count: "entry.1798430888",  // Corresponds to "UserESH" question
        userNAH_count: "entry.1154907513",  // Corresponds to "UserNAH" question
        userINFO_count: "entry.1211055051", // Corresponds to "UserINFO" question
        popAlignPercent: "entry.496798247", // Corresponds to "PopularityAlignmentPercent" question
        // answeredCount field seems missing from form HTML, so it's omitted here. Add if you have it.
        // answeredCount: "entry.YOUR_ANSWEREDCOUNT_ID",
        timestamp: "entry.2023000441"         // Corresponds to "Timestamp" question
    };
    // --- END Google Form Configuration ---


    // --- Generate/Retrieve Unique User Token ---
    function initializeUserToken() {
        try {
            let storedToken = localStorage.getItem(USER_TOKEN_KEY);
            if (storedToken && storedToken.length > 10) { // Basic check if token seems valid
                userToken = storedToken;
                console.log("Retrieved user token from localStorage:", userToken);
            } else {
                if (window.crypto && window.crypto.randomUUID) {
                    userToken = crypto.randomUUID();
                    localStorage.setItem(USER_TOKEN_KEY, userToken);
                    console.log("Generated and stored new user token:", userToken);
                } else {
                    // Fallback for very old browsers (less unique)
                    userToken = `fallback-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                    console.warn("crypto.randomUUID not supported, using fallback token:", userToken);
                    // Store the fallback token as well
                     localStorage.setItem(USER_TOKEN_KEY, userToken);
                }
            }
        } catch (e) {
             console.error("Error accessing localStorage or generating token:", e);
             // Use a session-only fallback if localStorage fails
             userToken = `error-${Date.now()}-${Math.random().toString(36).substring(2)}`;
             console.log("Using temporary session token due to error:", userToken);
        }
    }
    // --- END User Token Logic ---


    // --- Fetch and Display Posts ---
    async function loadPosts() {
        try {
            // Add cache-busting query parameter to ensure fresh data
            const response = await fetch(`top_aita_posts.json?v=${new Date().getTime()}`);
            console.log("Fetch response status:", response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - Could not fetch JSON file.`);
            }
            let rawPostsData = await response.json(); // Load raw data

            if (!rawPostsData || rawPostsData.length === 0) {
                 postsContainer.innerHTML = '<p>No post data found. Please generate/update the top_aita_posts.json file.</p>';
                 submitButton.style.display = 'none'; // Hide button if no data
                 return;
            }

            // --- Pre-calculate Reddit percentages and ensure necessary fields exist ---
            loadedPostsData = rawPostsData.map((post, index) => {
                if (!post || typeof post !== 'object') {
                    console.warn(`Skipping invalid raw post data at index ${index}:`, post);
                    return null; // Mark as invalid to filter out later
                }
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
                    id: post.id || `missing-id-${index}`, // Provide default ID if missing
                    title: post.title || '(Missing Title)',
                    url: post.url || '#', // Default URL if missing
                    body_summary: post.body_summary || '', // Default empty string
                    reddit_percentages: percentages, // Add calculated percentages
                    reddit_verdict: verdict, // Ensure verdict exists
                    total_judged: total, // Ensure total_judged is carried over
                    reddit_judgments: counts // Ensure judgments object is carried over
                };
            }).filter(post => post !== null); // Remove any posts marked as invalid
            // --- End Pre-calculation ---


            console.log(`Processed ${loadedPostsData.length} valid posts.`);

            // Display timestamp
            if (loadedPostsData.length > 0 && loadedPostsData[0]?.fetched_utc) { // Optional chaining
                 try { dataTimestampSpan.textContent = new Date(loadedPostsData[0].fetched_utc).toLocaleString(); }
                 catch (e) { dataTimestampSpan.textContent = "Unknown"; }
            } else { dataTimestampSpan.textContent = "Unknown"; }

            if (loadedPostsData.length > 0) {
                displayPosts();
                submitButton.style.display = 'block'; // Show submit button
                hasSubmitted = false; // Reset submission flag on new load
                submitButton.disabled = false; // Re-enable button if previously disabled
                submitButton.style.opacity = '1';
                submitButton.textContent = 'Analyze My Judgments!'; // Reset button text
                resultsSummaryDiv.style.display = 'none'; // Hide old results
            } else {
                 postsContainer.innerHTML = '<p>No valid posts found after processing. Check JSON structure and script logs.</p>';
                 submitButton.style.display = 'none'; // Hide button if no valid posts
            }

        } catch (error) {
            console.error('Error loading or processing post data:', error);
            postsContainer.innerHTML = `<p>Error loading posts: ${error.message}. Check browser console and verify 'top_aita_posts.json' exists and is valid JSON.</p>`;
            submitButton.style.display = 'none'; // Hide button on error
        }
    }

    function displayPosts() {
        postsContainer.innerHTML = ''; // Clear loading/previous posts
        const judgmentTypes = ["YTA", "NTA", "ESH", "NAH", "INFO"];
        console.log(`Attempting to display ${loadedPostsData.length} posts.`);

        loadedPostsData.forEach((post, index) => {
            // console.log(`Rendering post index ${index}, ID: ${post.id}`);
            try {
                const postElement = document.createElement('div');
                postElement.className = 'live-post';
                postElement.setAttribute('data-post-id', post.id);

                const titleLink = `https://www.reddit.com${post.url || '#'}`;
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

                // Add event listeners for label selection styling
                const radioButtons = postElement.querySelectorAll(`input[name="${groupName}"]`);
                if (radioButtons.length > 0) {
                    radioButtons.forEach(radio => { radio.addEventListener('change', handleRadioChange); });
                } else { console.warn(`No radio buttons found for post ${post.id}`); }

            } catch (renderError) {
                console.error(`Error rendering post index ${index}, ID: ${post.id}`, renderError);
                const errorElement = document.createElement('div');
                errorElement.className = 'live-post';
                errorElement.style.backgroundColor = '#ffdddd';
                errorElement.innerHTML = `<h3>Error rendering post: ${escapeHtml(post.title || 'Unknown Title')}</h3><p>Problem: ${renderError.message}</p>`;
                postsContainer.appendChild(errorElement);
            }
        });
        console.log("Finished displaying posts loop.");
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

    // --- Function to Send Data to Google Form ---
    async function sendDataToGoogleForm(data) {
        // Basic config checks
        if (!GOOGLE_FORM_ACTION_URL || GOOGLE_FORM_ACTION_URL.includes("YOUR_LONG_FORM_ID_HERE") ||
            !ENTRY_IDS.postID || ENTRY_IDS.postID.includes("YOUR_POSTID_ENTRY_ID") ||
            !ENTRY_IDS.userToken || ENTRY_IDS.userToken.includes("YOUR_USER_TOKEN_ENTRY_ID_HERE")) {
             console.warn("Google Form URL or required Entry IDs (postID, userToken) not configured correctly. Skipping submission.");
             return;
        }

        const formData = new FormData();
        const appendIfExists = (key, value) => {
             // Check if the ENTRY_ID for this key actually exists before trying to use it
             if (ENTRY_IDS[key]) {
                 formData.append(ENTRY_IDS[key], (value !== undefined && value !== null) ? value : '');
             } else {
                // console.warn(`Entry ID for key '${key}' not found in ENTRY_IDS configuration.`); // Optional warning
             }
        };

        // Append all configured fields
        appendIfExists('userToken', data.userToken);
        appendIfExists('postID', data.postID);
        appendIfExists('userJudgment', data.userJudgment);
        appendIfExists('redditVerdict', data.redditVerdict);
        appendIfExists('agreed', data.agreed);
        appendIfExists('popAlignPercent', data.popAlignPercent?.toFixed(1));
        appendIfExists('timestamp', data.timestamp || new Date().toISOString());

        const userCounts = data.userCategoryCounts || {};
        appendIfExists('userYTA_count', userCounts.YTA);
        appendIfExists('userNTA_count', userCounts.NTA);
        appendIfExists('userESH_count', userCounts.ESH);
        appendIfExists('userNAH_count', userCounts.NAH);
        appendIfExists('userINFO_count', userCounts.INFO);

        // Conditionally append answeredCount only if ENTRY_ID exists
        if (ENTRY_IDS.answeredCount) {
            appendIfExists('answeredCount', data.totalAnsweredInSession);
        }

        try {
            await fetch(GOOGLE_FORM_ACTION_URL, {
                method: "POST",
                mode: "no-cors",
                body: formData
            });
            // console.log(`Data submission attempted for post ID: ${data.postID}`);
        } catch (error) {
            console.error(`Error submitting data to Google Form for post ID ${data.postID}:`, error);
        }
    }
    // --- END Google Form Function ---

    // --- Handle Submission and Analysis ---
    submitButton.addEventListener('click', async () => {
        // --- Prevent Multiple Submissions ---
        if (hasSubmitted) {
             console.log("Analysis already submitted for this session.");
             alert("You have already submitted your analysis for this set of posts. Reload the page to judge again.");
             return;
        }
        // --- End Prevention ---

        console.log("Analysis started. Preparing data for submission.");

        let userJudgments = {};
        let answeredCount = 0;
        let agreementCount = 0;
        let totalPopularityPercent = 0;
        let userCategoryCounts = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0 };
        let redditCategoryTotals = { YTA: 0, NTA: 0, ESH: 0, NAH: 0, INFO: 0, TotalJudged: 0 };
        let harshMismatches = 0;
        let softMismatches = 0;

        const batchSubmissionData = [];

        // --- Collect Judgments & Prepare Batch ---
        loadedPostsData.forEach(post => {
            const selected = document.querySelector(`input[name="judgment-${post.id}"]:checked`);
            if (selected) {
                const userChoice = selected.value;
                userJudgments[post.id] = userChoice;
                answeredCount++;
                userCategoryCounts[userChoice]++;

                const agreed = userChoice === post.reddit_verdict;
                if (agreed) { agreementCount++; }

                let popAlign = 0;
                if (post.reddit_percentages && post.reddit_percentages[userChoice] !== undefined) {
                    popAlign = post.reddit_percentages[userChoice];
                    totalPopularityPercent += popAlign;
                }

                // Prepare data FOR THIS POST for Google Form batch
                 const postSubmissionData = {
                     userToken: userToken,
                     postID: post.id,
                     userJudgment: userChoice,
                     redditVerdict: post.reddit_verdict,
                     agreed: agreed ? 'Yes' : 'No',
                     popAlignPercent: popAlign,
                     timestamp: new Date().toISOString()
                 };
                 batchSubmissionData.push(postSubmissionData);

                // Accumulate Reddit totals & calculate mismatches
                const judgments = post.reddit_judgments || {};
                for (const cat in redditCategoryTotals) {
                    if (cat !== 'TotalJudged' && judgments.hasOwnProperty(cat)) {
                       redditCategoryTotals[cat] += judgments[cat];
                    }
               }
                redditCategoryTotals.TotalJudged += post.total_judged || 0;
                if (!agreed) {
                    const redditVerdict = post.reddit_verdict;
                    const userIsHarsh = ['YTA', 'ESH'].includes(userChoice);
                    const userIsSoft = ['NTA', 'NAH'].includes(userChoice);
                    const redditIsHarsh = ['YTA', 'ESH'].includes(redditVerdict);
                    const redditIsSoft = ['NTA', 'NAH'].includes(redditVerdict);
                    if (userIsHarsh && redditIsSoft) harshMismatches++;
                    else if (userIsSoft && redditIsHarsh) softMismatches++;
                }
            } else {
                userJudgments[post.id] = null;
            }
        }); // End of loadedPostsData.forEach

        if (answeredCount === 0) {
            alert("Please judge at least one post before analyzing.");
            return;
        }

        // --- Disable Button & Set Flag BEFORE Sending Data ---
        hasSubmitted = true;
        submitButton.disabled = true;
        submitButton.style.opacity = '0.6';
        submitButton.textContent = 'Submitting...';
        // --- End Disable ---

        // --- Send Batched Data to Google Forms ---
        console.log(`Attempting to submit data for ${batchSubmissionData.length} judged posts (User Token: ${userToken})...`);
        try {
            for (const data of batchSubmissionData) {
                // Add final aggregate data just before sending
                data.userCategoryCounts = userCategoryCounts;
                data.totalAnsweredInSession = answeredCount;
                await sendDataToGoogleForm(data);
                await new Promise(resolve => setTimeout(resolve, 50)); // Optional small delay
            }
            console.log("Finished attempting data submission.");
            submitButton.textContent = 'Analysis Submitted!';
        } catch (submissionError) {
            console.error("Error during batch submission:", submissionError);
            submitButton.textContent = 'Submission Error';
            // Optionally allow retry on error?
            // hasSubmitted = false;
            // submitButton.disabled = false;
            // submitButton.style.opacity = '1';
        }
        // --- End Send Data ---


        // --- Generate Results HTML ---
        let resultsHtml = `<p>You judged ${answeredCount} out of ${loadedPostsData.length} available posts.</p>`;

        // 1. Agreement Score
        const agreementPercentage = (answeredCount > 0) ? (agreementCount / answeredCount) * 100 : 0;
        resultsHtml += `<h4>Verdict Agreement</h4><p>You agreed with the Reddit majority verdict on <strong>${agreementCount} (${agreementPercentage.toFixed(1)}%)</strong> of the posts you judged.</p>`;

        // 2. Popularity Alignment
        const averagePopularityAlignment = (answeredCount > 0) ? totalPopularityPercent / answeredCount : 0;
        resultsHtml += `<h4>Popularity Alignment</h4><p>On average, your specific judgment matched the opinion of <strong>${averagePopularityAlignment.toFixed(1)}%</strong> of Reddit commenters on the posts you judged.`;
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

        // 4. Disagreement Style
        resultsHtml += `<h4>Disagreement Style</h4>`;
        const disagreementCount = answeredCount - agreementCount;
        if (disagreementCount > 0) {
            const otherMismatches = disagreementCount - harshMismatches - softMismatches;
            const harshMismatchRate = (harshMismatches / disagreementCount) * 100;
            const softMismatchRate = (softMismatches / disagreementCount) * 100;
            const otherMismatchRate = (otherMismatches / disagreementCount) * 100;
             resultsHtml += `<p>When you disagreed with the Reddit majority verdict (${disagreementCount} times):</p><ul>`;
             resultsHtml += `<li>You judged harsher (e.g., YTA/ESH when Reddit judged NTA/NAH) ${harshMismatches} times (${harshMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `<li>You judged softer (e.g., NTA/NAH when Reddit judged YTA/ESH) ${softMismatches} times (${softMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `<li>Other disagreements (e.g., involving INFO, Mixed, YTA vs ESH) occurred ${otherMismatches} times (${otherMismatchRate.toFixed(1)}%).</li>`;
             resultsHtml += `</ul>`;
        } else if (answeredCount > 0) {
             resultsHtml += `<p>You agreed with the Reddit majority verdict on all posts you judged!</p>`;
        } else {
             resultsHtml += `<p>No posts were judged.</p>`;
        }

        // 5. Overall Judgmental Tendency
        resultsHtml += `<h4>Overall Judgmental Tendency (vs. Reddit Majority Verdicts)</h4>`;
        let userYtaCount = userCategoryCounts['YTA'];
        let userNtaCount = userCategoryCounts['NTA'];
        const relevantRedditNtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'NTA').length;
        const relevantRedditYtaCount = loadedPostsData.filter(p => userJudgments[p.id] !== null && p.reddit_verdict === 'YTA').length;
        const userRatio = (userNtaCount === 0) ? (userYtaCount > 0 ? Infinity : 0) : userYtaCount / userNtaCount;
        const redditMajorityRatio = (relevantRedditNtaCount === 0) ? (relevantRedditYtaCount > 0 ? Infinity : 0) : relevantRedditYtaCount / relevantRedditNtaCount;

        if (answeredCount > 0 && (userNtaCount > 0 || userYtaCount > 0)) {
            const relativeTendency = getRelativeJudgment(userRatio, redditMajorityRatio);
            resultsHtml += `<p>Based on your YTA/NTA ratio (${userRatio === Infinity ? '∞' : userRatio.toFixed(2)}) compared to the ratio derived from Reddit's majority verdicts for the posts you judged (${redditMajorityRatio === Infinity ? '∞' : redditMajorityRatio.toFixed(2)}), you appear <strong>${relativeTendency}</strong> judgmental.</p>`;
            resultsHtml += `<p><em>Note: This compares your YTA/NTA votes only to the *majority* outcome on Reddit for these specific posts.</em></p>`;
        } else {
            resultsHtml += `<p>Not enough YTA/NTA judgments provided by you or found in Reddit majority verdicts for a meaningful ratio comparison.</p>`;
        }
        // --- End Generate Results HTML ---


        // Display results
        resultsContentDiv.innerHTML = resultsHtml;
        resultsSummaryDiv.style.display = 'block';
        resultsSummaryDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }); // --- End Submit Button Listener ---


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
    initializeUserToken(); // Generate/retrieve token first
    loadPosts(); // Then load posts

}); // End of DOMContentLoaded listener