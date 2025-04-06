document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('submit-judgments');
    const resultsDiv = document.getElementById('interactive-results');
    const form = document.getElementById('judgment-form');

    // --- Study Data ---
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
    function calculateOverallRatio(group) {
        let totalYTA = 0;
        let totalNTA = 0;
        for (const question in studyData) {
            totalYTA += studyData[question][group].YTA;
            totalNTA += studyData[question][group].NTA;
        }
        if (totalNTA === 0) { return (totalYTA > 0) ? Infinity : 0; }
        return totalYTA / totalNTA;
    }
    const redditOverallRatio = calculateOverallRatio('reddit');
    const studentOverallRatio = calculateOverallRatio('student');

    // --- Helper Functions (getPercentages, getRelativeJudgment, capitalizeFirstLetter) ---
    // (These functions remain exactly the same as before)
    function getPercentages(counts) {
        const total = counts.NTA + counts.Neither + counts.YTA;
        if (total === 0) return { NTA: 0, Neither: 0, YTA: 0 };
        return {
            NTA: ((counts.NTA / total) * 100).toFixed(1),
            Neither: ((counts.Neither / total) * 100).toFixed(1),
            YTA: ((counts.YTA / total) * 100).toFixed(1)
        };
    }
    function getRelativeJudgment(userRatio, groupRatio, tolerance = 0.15) {
        if (userRatio === Infinity) { return "more"; }
        if (groupRatio === Infinity) { return userRatio === Infinity ? "similarly" : "less"; }
        if (groupRatio === 0) { return userRatio > 0 ? "more" : "similarly"; }
        if (userRatio > groupRatio * (1 + tolerance)) { return "more"; }
        else if (userRatio < groupRatio * (1 - tolerance)) { return "less"; }
        else { return "similarly"; }
    }
    function capitalizeFirstLetter(string) {
        if (!string) return '';
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    // --- Initialize Bar Chart ---
    const chartCtx = document.getElementById('ratioChart')?.getContext('2d');
    if (chartCtx) {
        const chartLabels = ['Wedding', 'Cat', 'Child Support', 'Plane Babysit', 'Trust Fund'];
        const redditRatios = [0.85, 0.7, 1.95, 1.27, 0.82]; // Data extracted from image
        const studentRatios = [0.21, 0.46, 0.18, 2.06, 0.38]; // Data extracted from image

        new Chart(chartCtx, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    {
                        label: 'Reddit',
                        data: redditRatios,
                        backgroundColor: 'rgba(135, 206, 250, 0.7)', // Light blue with transparency
                        borderColor: 'rgba(0, 0, 255, 1)', // Solid blue
                        borderWidth: 1
                    },
                    {
                        label: 'Students',
                        data: studentRatios,
                        backgroundColor: 'rgba(255, 182, 193, 0.7)', // Light red/pink with transparency
                        borderColor: 'rgba(255, 0, 0, 1)', // Solid red
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allow chart to fill container height/width
                plugins: {
                    title: {
                        display: true,
                        text: 'Ratio (YTA / NTA) by Category'
                    },
                    legend: {
                        position: 'bottom' // Match original image legend position
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Ratio (YTA / NTA)'
                        }
                    },
                    x: {
                         title: {
                            display: true,
                            text: 'Categories'
                        }
                    }
                }
            }
        });
    } else {
        console.error("Canvas element for chart not found!");
    }
    // --- End of Bar Chart Initialization ---


    // --- Event Listener for Judgment Button Click ---
    if (submitButton) {
        submitButton.addEventListener('click', () => {
            // (This whole section remains exactly the same as before)
            resultsDiv.innerHTML = '';
            let resultsHtml = '<h3>Your Comparison Per Question:</h3>';
            let answeredCount = 0;
            let userTotalYTA = 0;
            let userTotalNTA = 0;
            const formData = new FormData(form);
            const userAnswers = { /* ... user answers object ... */
                wedding: formData.get('wedding'),
                cat: formData.get('cat'),
                child_support: formData.get('child_support'),
                plane: formData.get('plane'),
                trust_fund: formData.get('trust_fund')
            };
            for (const question in userAnswers) {
                 const userAnswer = userAnswers[question];
                if (userAnswer) {
                    answeredCount++;
                    if (userAnswer === 'YTA') userTotalYTA++;
                    else if (userAnswer === 'NTA') userTotalNTA++;
                    const questionData = studyData[question];
                    const redditPercentages = getPercentages(questionData.reddit);
                    const studentPercentages = getPercentages(questionData.student);
                    resultsHtml += `<p><strong>${capitalizeFirstLetter(question.replace('_', ' '))} Question:</strong> You chose <strong>${userAnswer}</strong>.</p><ul>`;
                    resultsHtml += `<li>Redditors judged ${userAnswer}: ${redditPercentages[userAnswer]}%</li>`;
                    resultsHtml += `<li>Students judged ${userAnswer}: ${studentPercentages[userAnswer]}%</li>`;
                    resultsHtml += `</ul><hr>`;
                }
            }
            let overallSummaryHtml = '<h3>Overall Judgment Summary:</h3>';
            if (answeredCount === 0) {
                 resultsHtml = '<p>Please answer at least one question to see the comparison.</p>';
                 overallSummaryHtml = '';
            } else {
                let userOverallRatio = (userTotalNTA === 0) ? (userTotalYTA > 0 ? Infinity : 0) : userTotalYTA / userTotalNTA;
                const judgmentVsReddit = getRelativeJudgment(userOverallRatio, redditOverallRatio);
                const judgmentVsStudents = getRelativeJudgment(userOverallRatio, studentOverallRatio);
                overallSummaryHtml += `<p>Based on your answers (YTA/NTA ratio ≈ ${userOverallRatio === Infinity ? '∞' : userOverallRatio.toFixed(2)}):</p><ul>`;
                overallSummaryHtml += `<li>Compared to the <strong>Reddit AITA</strong> commenters (ratio ≈ ${redditOverallRatio.toFixed(2)}), you seem <strong>${judgmentVsReddit}</strong> judgmental.</li>`;
                overallSummaryHtml += `<li>Compared to the <strong>CMSC320 Students</strong> (ratio ≈ ${studentOverallRatio.toFixed(2)}), you seem <strong>${judgmentVsStudents}</strong> judgmental.</li>`;
                overallSummaryHtml += `</ul>`;
                overallSummaryHtml += `<p><em>Note: "Judgmental" here is based solely on the ratio of 'YTA' to 'NTA' votes across the questions answered.</em></p><hr>`;
            }
            resultsDiv.innerHTML = overallSummaryHtml + resultsHtml;
            resultsDiv.style.display = 'block';
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    } else {
        console.error("Submit judgments button not found!");
    }


    // --- Share Button Functionality ---
    const shareButton = document.getElementById('share-button');
    const shareUrl = 'https://david3748.github.io/Are-We-Judgemental-Website/';
    const shareTitle = 'Are We Judgmental? Study';
    const shareText = 'Check out this comparison of student vs. Reddit AITA judgments:';

    if (shareButton) {
        shareButton.addEventListener('click', async () => {
             // (This whole section remains exactly the same as before)
            const shareData = { title: shareTitle, text: shareText, url: shareUrl };
            if (navigator.share) {
                try {
                    await navigator.share(shareData);
                    console.log('Content shared successfully');
                } catch (err) {
                    if (err.name !== 'AbortError') { console.error('Error sharing:', err); }
                    else { console.log('Share cancelled by user.'); }
                }
            } else if (navigator.clipboard) {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    const originalText = shareButton.innerHTML;
                    shareButton.disabled = true;
                    shareButton.innerHTML = '✅ Link Copied!';
                    setTimeout(() => {
                        shareButton.innerHTML = originalText;
                        shareButton.disabled = false;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy link:', err);
                    alert('Sharing not supported, and failed to copy link to clipboard.');
                }
            } else {
                alert('Sharing is not supported on this browser. You can manually copy the link from the address bar.');
                console.log('Web Share and Clipboard API not supported.');
            }
        });
    } else {
        console.warn('Share button element not found.');
    }
    // --- End of Share Button Functionality ---

}); // End of DOMContentLoaded listener