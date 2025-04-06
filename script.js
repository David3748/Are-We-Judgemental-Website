document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('submit-judgments');
    const resultsDiv = document.getElementById('interactive-results');
    const form = document.getElementById('judgment-form');

    // --- Study Data (from Tables 2-6) ---
    // Store counts for easier access: { NTA: count, Neither: count, YTA: count }
    const studyData = {
        wedding: {
            reddit: { NTA: 108, Neither: 16, YTA: 92 },
            student: { NTA: 279, Neither: 115, YTA: 58 }
        },
        cat: {
            reddit: { NTA: 291, Neither: 253, YTA: 203 },
            student: { NTA: 193, Neither: 177, YTA: 88 }
        },
        child_support: {
            reddit: { NTA: 75, Neither: 13, YTA: 146 },
            student: { NTA: 278, Neither: 120, YTA: 51 }
        },
        plane: {
            reddit: { NTA: 453, Neither: 127, YTA: 575 },
            student: { NTA: 86, Neither: 191, YTA: 177 }
        },
        trust_fund: {
            reddit: { NTA: 33, Neither: 5, YTA: 27 },
            student: { NTA: 220, Neither: 156, YTA: 83 }
        }
    };

    // --- Pre-calculate Overall Group Ratios ---
    function calculateOverallRatio(group) { // group is 'reddit' or 'student'
        let totalYTA = 0;
        let totalNTA = 0;
        for (const question in studyData) {
            totalYTA += studyData[question][group].YTA;
            totalNTA += studyData[question][group].NTA;
        }
        if (totalNTA === 0) {
            return (totalYTA > 0) ? Infinity : 0; // Handle division by zero
        }
        return totalYTA / totalNTA;
    }

    const redditOverallRatio = calculateOverallRatio('reddit'); // Approx 1.086
    const studentOverallRatio = calculateOverallRatio('student'); // Approx 0.433

    // --- Helper Function to Calculate Percentages (Per Question) ---
    function getPercentages(counts) {
        const total = counts.NTA + counts.Neither + counts.YTA;
        if (total === 0) return { NTA: 0, Neither: 0, YTA: 0 };
        return {
            NTA: ((counts.NTA / total) * 100).toFixed(1),
            Neither: ((counts.Neither / total) * 100).toFixed(1),
            YTA: ((counts.YTA / total) * 100).toFixed(1)
        };
    }

    // --- Helper Function to Compare Ratios and Get Relative Judgment ---
    function getRelativeJudgment(userRatio, groupRatio, tolerance = 0.15) {
        if (userRatio === Infinity) {
            // User is infinitely judgmental if they only picked YTA
            // Group ratios are finite, so user is always 'more' judgmental
            return "more";
        }
        if (groupRatio === Infinity) { // Should not happen with this data
             return userRatio === Infinity ? "similarly" : "less";
        }
        // Handle the case where groupRatio is 0 (user can only be 'more' or 'similarly')
        if (groupRatio === 0) {
             return userRatio > 0 ? "more" : "similarly";
        }

        // Standard comparison with tolerance
        if (userRatio > groupRatio * (1 + tolerance)) {
            return "more";
        } else if (userRatio < groupRatio * (1 - tolerance)) {
            return "less";
        } else {
            return "similarly";
        }
    }


    // --- Event Listener for Judgment Button Click ---
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            resultsDiv.innerHTML = ''; // Clear previous results
            let resultsHtml = '<h3>Your Comparison Per Question:</h3>';
            let answeredCount = 0;
            let userTotalYTA = 0;
            let userTotalNTA = 0;

            const formData = new FormData(form);
            const userAnswers = {
                wedding: formData.get('wedding'),
                cat: formData.get('cat'),
                child_support: formData.get('child_support'),
                plane: formData.get('plane'),
                trust_fund: formData.get('trust_fund')
            };

            // 1. Process each question for detailed comparison and count totals
            for (const question in userAnswers) {
                const userAnswer = userAnswers[question];
                if (userAnswer) { // Only process if answered
                    answeredCount++;
                    if (userAnswer === 'YTA') {
                        userTotalYTA++;
                    } else if (userAnswer === 'NTA') {
                        userTotalNTA++;
                    }

                    const questionData = studyData[question];
                    const redditPercentages = getPercentages(questionData.reddit);
                    const studentPercentages = getPercentages(questionData.student);

                    resultsHtml += `<p><strong>${capitalizeFirstLetter(question.replace('_', ' '))} Question:</strong> You chose <strong>${userAnswer}</strong>.</p><ul>`;
                    resultsHtml += `<li>Redditors judged ${userAnswer}: ${redditPercentages[userAnswer]}%</li>`;
                    resultsHtml += `<li>Students judged ${userAnswer}: ${studentPercentages[userAnswer]}%</li>`;
                    resultsHtml += `</ul><hr>`; // Add a separator

                }
            }

            // 2. Calculate User's Overall Ratio and Compare
            let overallSummaryHtml = '<h3>Overall Judgment Summary:</h3>';
            if (answeredCount === 0) {
                 resultsHtml = '<p>Please answer at least one question to see the comparison.</p>';
                 overallSummaryHtml = ''; // No summary if no questions answered
            } else {
                let userOverallRatio;
                if (userTotalNTA === 0) {
                    userOverallRatio = (userTotalYTA > 0) ? Infinity : 0;
                } else {
                    userOverallRatio = userTotalYTA / userTotalNTA;
                }

                const judgmentVsReddit = getRelativeJudgment(userOverallRatio, redditOverallRatio);
                const judgmentVsStudents = getRelativeJudgment(userOverallRatio, studentOverallRatio);

                overallSummaryHtml += `<p>Based on your answers (YTA/NTA ratio ≈ ${userOverallRatio === Infinity ? '∞' : userOverallRatio.toFixed(2)}):</p><ul>`;
                overallSummaryHtml += `<li>Compared to the <strong>Reddit AITA</strong> commenters (ratio ≈ ${redditOverallRatio.toFixed(2)}), you seem <strong>${judgmentVsReddit}</strong> judgmental.</li>`;
                overallSummaryHtml += `<li>Compared to the <strong>CMSC320 Students</strong> (ratio ≈ ${studentOverallRatio.toFixed(2)}), you seem <strong>${judgmentVsStudents}</strong> judgmental.</li>`;
                overallSummaryHtml += `</ul>`;
                overallSummaryHtml += `<p><em>Note: "Judgmental" here is based solely on the ratio of 'YTA' to 'NTA' votes across the questions answered.</em></p><hr>`; // Add separator after summary too
            }

            // 3. Display results
            resultsDiv.innerHTML = overallSummaryHtml + resultsHtml; // Show summary first
            resultsDiv.style.display = 'block'; // Show results area
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' }); // Scroll down to results
        });
    } else {
        console.error("Submit judgments button not found!");
    }


    // --- Share Button Functionality ---
    const shareButton = document.getElementById('share-button');
    const shareUrl = 'https://david3748.github.io/Are-We-Judgemental-Website/'; // The URL to share
    const shareTitle = 'Are We Judgmental? Study'; // Title used by share targets
    const shareText = 'Check out this comparison of student vs. Reddit AITA judgments:'; // Optional text

    if (shareButton) { // Check if the button exists
        shareButton.addEventListener('click', async () => {
            const shareData = {
                title: shareTitle,
                text: shareText,
                url: shareUrl,
            };

            if (navigator.share) {
                // Use Web Share API if available
                try {
                    await navigator.share(shareData);
                    console.log('Content shared successfully');
                    // Optionally provide feedback to the user here (e.g., temporary button text change)
                } catch (err) {
                    // Handle errors (e.g., user cancelled share)
                    // Avoid alerting errors for user cancellations
                    if (err.name !== 'AbortError') {
                         console.error('Error sharing:', err);
                         // Consider a less intrusive notification than alert
                         // e.g., display a temporary message near the button
                         // alert(`Could not share: ${err.message}`);
                    } else {
                        console.log('Share cancelled by user.');
                    }
                }
            } else if (navigator.clipboard) {
                // Fallback: Copy link to clipboard
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    // Provide feedback that link was copied
                    const originalText = shareButton.innerHTML;
                    shareButton.disabled = true; // Briefly disable button
                    shareButton.innerHTML = '✅ Link Copied!';
                    setTimeout(() => {
                        shareButton.innerHTML = originalText;
                        shareButton.disabled = false; // Re-enable button
                    }, 2000); // Revert after 2 seconds
                } catch (err) {
                    console.error('Failed to copy link:', err);
                    alert('Sharing not supported, and failed to copy link to clipboard.');
                }
            } else {
                // Very basic fallback if neither API is supported
                alert('Sharing is not supported on this browser. You can manually copy the link from the address bar.');
                console.log('Web Share and Clipboard API not supported.');
            }
        });
    } else {
        console.warn('Share button element not found.');
    }
    // --- End of Share Button Functionality ---


    // Helper to capitalize question names nicely
    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

}); // End of DOMContentLoaded listener