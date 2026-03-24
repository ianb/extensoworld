The output that gets printed out is from the *V-ATTACK* action. It gets printed because the *MAILBOX* object doesn’t have the *ACTORBIT* flag which is required to successfully execute an attack on something. In simpler terms, because the *MAILBOX* object isn’t a game character it can’t be attacked and the *V-ATTACK* action outputs a witty retort.

[](/download-app?source=promotion_paragraph---post_body_banner_surround_blocks--b68012952bdc---------------------------------------)

This description is a somewhat simplified architecture because it doesn’t take into account a synonym table, part-of-speech tagging, and the fact that the parser supports clauses. I recommend reading through the source code and manuals to get a more detailed understanding of the architecture. But the description provided in this article should be a good starting off point when it comes to exploring the game’s architecture and its source code.

## Exploring the Source Code

Now that we have a general understanding of how the game works let’s look at its source code.

Press enter or click to view image in full size

![A list of all the files contained within the Zork I GitHub repository.](https://miro.medium.com/v2/resize:fit:700/1*TcaVQDv4FBLh0EOu-Jp6og.png)

Zork I GitHub repository files.

Looking at the file structure above, any software engineer could make a reasonable guess that the game starts in gmain.zil since main is a common software [entry point](https://en.wikipedia.org/wiki/Entry_point). They would be wrong 🙂. The game execution starts in the [*GO*](https://github.com/historicalsource/zork1/blob/master/1dungeon.zil#L2637) function which is located in 1dungeon.zil. The function takes care of some setup logic and in the end starts the game’s main loop, whose function is located in gmain.zil.

Press enter or click to view image in full size

![Function definition of GO, which is the entry point to Zork I.](https://miro.medium.com/v2/resize:fit:700/1*903W6hd2MI-deOyYm_On_w.png)

The entry point to the Zork I game.

The [*MAIN-LOOP*](https://github.com/historicalsource/zork1/blob/master/gmain.zil#L38) function essentially performs the loop I described in the previous chapter, where the player’s input is parsed and the game finds the appropriate syntax and game objects being referred to in said input. Afterward, actions for the matching syntax and game objects are executed. The *MAIN-LOOP* calls the [*PARSER*](https://github.com/historicalsource/zork1/blob/master/gparser.zil#L109) function to parse the input and afterward, it executes the actions by calling the [*PERFORM*](https://github.com/historicalsource/zork1/blob/master/gmain.zil#L235) function. The *PARSER* function is located in gparser.zil along with a ton of helper functions and the *PERFORM* function is located in gmain.zil.  
Besides the main game logic, game object definitions are located in 1dungeon.zil, the object’s action definitions are located in 1actions.zil, syntax definitions are located in gsyntax.zil and syntax’s action definitions are located in gverbs.zil. Lastly, gclock.zil contains a rudimentary implementation of a timer mechanism that the game uses to trigger time-based events. That covers all the major aspects of the game. Other files contain helper functions and additional game object definitions.

The repository also contains a compiled version of the game in [z3](https://fileinfo.com/extension/z3) format. You can run the game using one of the many [Z-machine](https://en.wikipedia.org/wiki/Z-machine) interpreters out there. I recommend [Frotz](https://davidgriffith.gitlab.io/frotz/).

Now, let’s look at some of the more interesting aspects of Zork’s source code. Firstly, let’s start with the [xyzzy](https://en.wikipedia.org/wiki/Xyzzy_\(computing\)) easter egg. The *XYZZY* command was added to Zork as an easter egg or a nod to the [Colossal Cave Adventure](https://en.wikipedia.org/wiki/Colossal_Cave_Adventure), which was the first text-based adventure game.

Press enter or click to view image in full size

![Shows a simple syntax definition source code for the “xyzzy” command made with 4 lines of code.](https://miro.medium.com/v2/resize:fit:700/1*pNikFE1UKYJhw66VwIHZAw.png)

XYZZY syntax definition.

Executing the command at any point in the game would always produce the same response:

\>xyzzy  
A hollow voice says “Fool.”

Another interesting find is the inclusion of the *RAPE* command. Yes, you’re reading that correctly, it’s not a typo. The command didn’t really do anything and was most likely put there by the authors for comedic effect, but it’s certainly something that wouldn’t be found in today's games.

Press enter or click to view image in full size

![Shows the source code of “rape” game command consisting of 4 lines of code.](https://miro.medium.com/v2/resize:fit:700/1*LezqWGgS3A4CzQAetdeqkQ.png)

RAPE command syntax definition.

Again, similar to the *XYZZY* command the player could execute the command at any point in-game and receive the same response.

West of House  
You are standing in an open field west of a white house, with a boarded front door.  
There is a small mailbox here.\>rape the mailbox  
What a (ahem!) strange idea.

To me, especially considering the problems in the present gaming culture², the command is an interesting window into the gaming culture of the past and how this cultural behavior got passed on to the newer generations and potentiated.

One piece of source code I have to address is something the gaming community already discovered back in 2017³. Back then they didn’t have access to the original ZIL code so they used the decompiled Z-code to decode this trolling logic. The game has an interesting inventory management logic. Essentially whenever a player tries to put an object into their inventory the [*ITAKE*](https://github.com/historicalsource/zork1/blob/master/gverbs.zil#L1900) function is executed.

Press enter or click to view image in full size

![Shows source code if ITAKE function consisting of 35 lines of code with 6 if, else if, else statements.](https://miro.medium.com/v2/resize:fit:700/1*NkFicmF1NDRsiiA9zkZAhQ.png)

Games TAKE logic.

The function checks if the item can be safely put into the player's inventory. It does this by performing five checks where if one of them fails the object can’t be taken by the player. On line 3 it checks if the player is dead, on line 7 it checks if the object can be taken, on line 11 it checks if the object is located within a closed container, on line 15 it checks if the item exceeds the inventory load allowed, and then the pièce de résistance, on line 25 it checks the number of items currently held in inventory and if that number is greater than 7 it randomly returns “You’re holding too many things already!”. What this means is that during gameplay if you see this response you can retry taking it and if the random number generator is on your side you’ll be able to pick it up. Using the randomness approach, the developers successfully trolled the game’s players into guessing what the maximum number of items they could carry was.

\>go north  
Studio  
This appears to have been an artist’s studio. The walls and floors are splattered with paints of 69 different colors. Strangely enough, nothing of value is hanging here. At the south end of the room  
is an open door (also covered with paint). A dark and narrow chimney leads up from a fireplace; although you might be able to get up it, it seems unlikely you could get back down.  
Loosely attached to a wall is a small piece of paper.  
A “lean and hungry” gentleman just wandered through, carrying a large bag. Finding nothing of value, he left disgruntled.\>inventory  
You are carrying:  
 A nasty knife  
 A rope  
 A sword  
 A brass lantern (providing light)  
 A brown sack  
 A lunch  
 A clove of garlic  
 A glass bottle  
 The glass bottle contains:  
 A quantity of water\>take paper  
You’re holding too many things already!\>take paper  
Taken.

Besides easter eggs, inappropriate game commands, and trolling game mechanics, the source code also contains interesting comments. Some of the comments show unused code which was commented out, and other comments show how developers tracked changes before [source version control](https://en.wikipedia.org/wiki/Version_control) became popular.

Press enter or click to view image in full size

![Source code excerpt with two comments “next added 1/2/85 by JW” and “Changed 6/10/83 — MARC”.](https://miro.medium.com/v2/resize:fit:700/1*7zxBEf35sPp7xj3xKMlk0Q.png)

Change tracking using comments.

This source code excerpt was taken from [*GET-OBJECT*](https://github.com/historicalsource/zork1/blob/master/gparser.zil#L1040) function located in gparser.zil. We can also make an educated guess that MARC refers to [Marc Blank](https://en.wikipedia.org/wiki/Marc_Blank), who was one of the initial creators of Zork, but I couldn’t figure out who JW could be.

The entire Zork I codebase consists of more than 15k lines of code so there are plenty more interesting comments, curious game logic, and offensive humor to be found. But we’ve gone through plenty in this article 😁.

## Summary

Exploring and examining the Zork I source code gave me the knowledge and confidence needed to port the game into a modern programming language. I’ve started porting the game into [Golang](https://en.wikipedia.org/wiki/Go_\(programming_language\)) and you can check out my project on [GitHub](https://github.com/ajdnik/gozork). It’s still a work in progress and while I’ve ported the parser and the syntax I still have a lot of work to do. After I finish porting it to Golang I might rebuild the game in [React](https://en.wikipedia.org/wiki/React_\(web_framework\))/[Redux](https://en.wikipedia.org/wiki/Redux_\(JavaScript_library\)), I’m curious if a game such as this could be built entirely in a Redux architecture.
