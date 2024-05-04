import { config } from "dotenv";
import { ChannelType, Client, Routes, SlashCommandBuilder } from "discord.js";
import { REST } from "@discordjs/rest";
import schedule from "node-schedule";

config();

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMembers"],
});

client.login(TOKEN);

const rest = new REST({ version: "10" }).setToken(TOKEN);

client.on("ready", () => {
  console.log(`${client.user.tag} is now monitoring`);
});

client.on("interactionCreate", (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "schedule") {
      const message = interaction.options.getString("message");
      const time = interaction.options.getInteger("time");
      const channel = interaction.options.getChannel("channel");

      const date = new Date(new Date().getTime() + time);

      if (regex.test(message)) {
        for (let word of inappropriate) {
          if (message.toLowerCase().includes(word)) {
            interaction.reply({
              content: "Inappropiate scheduled messages will not go trough!",
            });
            return;
          }
        }
      }

      interaction.reply({
        content: `Your message has been scheduled for ${date.toTimeString()}`,
      });
      schedule.scheduleJob(date, () => {
        channel.send({ content: message });
      });
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  const commandName = interaction.commandName;
  if (commandName === "sensitive") {
    let str = sensitive.join(", ");
    const lastComma = str.lastIndexOf(",");
    if (lastComma !== -1)
      str = str.substring(0, lastComma) + " and" + str.substring(lastComma + 1);
    await interaction.reply(
      `${str} are all considered sensitive words in this chat.`
    );
  }

  if (commandName === "offensive") {
    const checkOption = interaction.options.getString("check");
    if (checkOption) {
      if (inappropriate.includes(checkOption)) {
        await interaction.reply("offensive ❌");
      } else {
        await interaction.reply("inoffensive 👍");
      }
    } else {
      await interaction.reply("Specify search with 'check' option");
    }
  }
});

async function main() {
  const commands = [
    new SlashCommandBuilder()
      .setName("schedule")
      .setDescription("Schedules a message")
      .addStringOption((option) =>
        option
          .setName("message")
          .setDescription("The message to be scheduled")
          .setMinLength(10)
          .setMaxLength(2000)
          .setRequired(true)
      )
      .addIntegerOption((option) =>
        option
          .setName("time")
          .setDescription("When to schedule the message")
          .setChoices(
            { name: "10 seconds", value: 10000 },
            { name: "5 minutes", value: 300000 },
            { name: "15 minutes", value: 900000 },
            { name: "30 minutes", value: 1800000 },
            { name: "1 hour", value: 3600000 }
          )
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("The channel the message should be sent to")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .toJSON(),
    {
      name: "sensitive",
      description:
        "List of words that will cause the bot to give advice every so often.",
    },

    {
      name: "offensive",
      description: "Possibility to check which words will trigger a warning.",
      options: [
        {
          name: "check",
          description: "check for offensive words",
          type: 3,
        },
      ],
    },
  ];
  try {
    console.log("Started refreshing (/) commands");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
  } catch (err) {
    console.log(err);
  }
}
main();

let warningCounter = {};
const blackList = [];
const inappropriate = ["asshole", "bitch", "fuck", "retard", "shit"];
const sensitive = [
  "abuse",
  "abusive",
  "cancer",
  "depressed",
  "depressive",
  "die",
  "disorder",
  "dying",
  "illness",
  "mental",
  "murder",
  "suicide",
];
let regex = new RegExp(inappropriate.join("|"));

const unmuteAfterTimeout = function (member, role, duration) {
  setTimeout(() => {
    member.roles.remove(role).catch(console.error);
    warningCounter[member.id] = 3;
  }, duration);
};

let sensitiveMessageSent;
let displayName;

client.on("guildMemberAdd", (member) => {
  displayName = member.displayName;

  if (displayName) {
    if (regex.test(displayName)) {
      for (let word of inappropriate) {
        if (displayName.toLowerCase().includes(word))
          displayName = displayName.replace(
            new RegExp(word, "gi"),
            "*".repeat(word.length)
          );
      }
    }
  }
  member.setNickname(displayName).catch((error) => {
    console.error(`Error setting nickname for ${member.user.tag}: ${error}`);
  });
});

client.on("guildMemberUpdate", (oldMember, newMember) => {
  let oldDisplayName = oldMember.displayName;
  let newDisplayName = newMember.displayName;

  if (oldDisplayName !== newDisplayName) {
    if (newDisplayName) {
      if (regex.test(newDisplayName)) {
        for (let word of inappropriate) {
          if (newDisplayName.toLowerCase().includes(word))
            newDisplayName = newDisplayName.replace(
              new RegExp(word, "gi"),
              "*".repeat(word.length)
            );
        }
      }
    }
    newMember.setNickname(newDisplayName).catch((error) => {
      console.error(
        `Error setting nickname for ${newMember.user.tag}: ${error}`
      );
    });
  }
});

client.on("messageCreate", async (message) => {
  let displayName = message.member.displayName;

  if (message.author.bot) return;

  if (!warningCounter[message.author.id]) {
    warningCounter[message.author.id] = 3;
  }

  let userKicked = false;

  let censoredMessage = (
    await Promise.all(
      message.content.split(" ").map(async (word) => {
        if (regex.test(word.toLowerCase())) {
          warningCounter[message.author.id]--;
          if (warningCounter[message.author.id] < 1) {
            if (!blackList.includes(message.author.displayName)) {
              let mutedRole = message.guild.roles.cache.find(
                (role) => role.name === "Muted"
              );

              message.member.roles
                .add(mutedRole)
                .catch((error) => console.error(error));
              blackList.push(message.author.displayName);
              blackList.sort((a, b) => (a < b ? -1 : 1));
              unmuteAfterTimeout(message.member, mutedRole, 60000);
            } else {
              try {
                warningCounter[message.member.id] = 3;
                await message.channel.send(
                  `${displayName} has been kicked for repeatedly violating the guidelines!`
                );
                await message.member.kick();
                userKicked = true;
              } catch (error) {
                console.error(error);
                return `Failed to kick ${displayName} due to an error.`;
              }
            }
          }
          return (
            word[0] +
            word.slice(1, -1).replaceAll(/\w/g, "\\*") +
            word[word.length - 1]
          );
        }
        return word;
      })
    )
  ).join(" ");

  if (censoredMessage !== message.content && !userKicked) {
    message.delete().catch((error) => {
      if (error.code === 10008) {
        console.error("The message was already deleted.");
      } else {
        console.error("Failed to delete the message:", error);
      }
    });
    message.channel.send(
      warningCounter[message.author.id] > 0
        ? `Warning to ${displayName}. Keep the chat free from foul and abusive language! --> (${censoredMessage}) Remaining chances: ${
            warningCounter[message.author.id]
          }`
        : `${displayName} has been muted for repeatedly violating the guidelines!`
    );
  }

  let words = message.content.toLowerCase().split(/\W+/);
  let sensitiveWordFound = false;

  for (let part of sensitive) {
    if (words.includes(part)) {
      sensitiveWordFound = true;
      break;
    }
  }

  if (sensitiveWordFound && !sensitiveMessageSent) {
    message.channel.send(
      "A sincere reminder that when experiencing health and/or pyschological problems or having related questions, it is important to talk to a professional. Help is always available, no matter how hard it may seem."
    );
    sensitiveMessageSent = true;
    setTimeout(() => (sensitiveMessageSent = false), 60000);
  }
});

client.login(TOKEN);
