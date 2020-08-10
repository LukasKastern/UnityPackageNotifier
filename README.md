# UnityPackageNotifier

This is my 2nd attempt at touching JS, the goal was to create a discord bot which notifies you when packages do release.

The setup is fairly straight forward, after adding the bot to a discord server you can use !subscribe and !unscrubscribe to tell the bot if you are interested in receiving dm's.

With !addpackage "packageName" the bot will start listening for new releases of the given package name.

The bot sends dm's to the subscribed users when a new package of the added ones releases.
Those dm's contain the entire changelog since the last version to bot knew of, the log is merged together instead of separated by version.

To test the functionality out you can edit the lastStoredVersion of a package inside the PackagesToListenFor.json.
