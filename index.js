
const core = require('@actions/core');
const axios = require('axios');

const {
  getPullRequestsToReview,
  getPullRequestsWithoutLabel,
  getPullRequestsReviewersCount,
  createPr2UserArray,
  prettyMessage,
  stringToObject,
  getTeamsMentions,
  formatSlackMessage,
  formatTeamsMessage,
} = require('./functions');

const { GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_API_URL } = process.env;
const AUTH_HEADER = {
  Authorization: `token ${GITHUB_TOKEN}`,
};
const PULLS_ENDPOINT = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls`;


async function getPullRequestsNeedingReview(prs) {
  const issuesNeedingReview = (await axios({
    method: 'GET',
    url: `${GITHUB_API_URL}/search/issues`,
    params: {
      q: 'is:pr state:open review:required',
      sort: 'updated',
      order: 'desc',
      per_page: '100'
    },
    headers: AUTH_HEADER,
  })).data.items;

  console.log(JSON.stringify(issuesNeedingReview));

  const prUrlsNeedingReview = issuesNeedingReview.map(issue => issue.pull_request.url);

  console.log(JSON.stringify(prUrlsNeedingReview));


  return prs.filter(pr => prUrlsNeedingReview.includes(pr.url));
}

/**
 * Get Pull Requests from GitHub repository
 * @return {Promise} Axios promise
 */
async function getPullRequests() {
  return (await axios({
    method: 'GET',
    url: PULLS_ENDPOINT,
    params: {
      per_page: '100'
    },
    headers: AUTH_HEADER,
  })).data;
}

/**
 * Send notification to a channel
 * @param {String} webhookUrl Webhook URL
 * @param {String} messageData Message data object to send into the channel
 * @return {Promise} Axios promise
 */
async function sendNotification(webhookUrl, messageData) {
  return axios({
    method: 'POST',
    url: webhookUrl,
    data: messageData,
  });
}

/**
 * Main function for the GitHub Action
 */
async function main() {
  try {
    const webhookUrl = core.getInput('webhook-url');
    const provider = core.getInput('provider');
    const channel = core.getInput('channel');
    const github2providerString = core.getInput('github-provider-map');
    const ignoreLabel = core.getInput('ignore-label');
    core.info('Getting open pull requests...');
    const pullRequests = await getPullRequests();
    const pullRequestsNeedingReview = await getPullRequestsNeedingReview(pullRequests);

    console.log(JSON.stringify(pullRequestsNeedingReview));

    return;

    const totalReviewers = await getPullRequestsReviewersCount(pullRequestsNeedingReview);
    core.info(`There are ${pullRequests.data.length} open pull requests and ${totalReviewers} reviewers`);
    const pullRequestsToReview = getPullRequestsToReview(pullRequests.data);
    const pullRequestsWithoutLabel = getPullRequestsWithoutLabel(pullRequestsToReview, ignoreLabel);
    core.info(`There are ${pullRequestsWithoutLabel.length} pull requests waiting for reviews`);
    if (pullRequestsWithoutLabel.length) {
      const pr2user = createPr2UserArray(pullRequestsWithoutLabel);
      const github2provider = stringToObject(github2providerString);
      const messageText = prettyMessage(pr2user, github2provider, provider);
      let messageObject;
      switch (provider) {
        case 'slack':
          messageObject = formatSlackMessage(channel, messageText);
          break;
        case 'msteams': {
          const msTeamsMentions = getTeamsMentions(github2provider, pr2user);
          messageObject = formatTeamsMessage(messageText, msTeamsMentions);
          break;
        }
      }
      await sendNotification(webhookUrl, messageObject);
      core.info(`Notification sent successfully!`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

