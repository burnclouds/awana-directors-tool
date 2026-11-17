// Invented-looking names for make-test-data.js. Ordinary US first names and surnames, none taken from the club's families
// (the generator drops any that match a real name in the files it reads, and the names used by the 15 import test cases).
const girls = ('Abigail Addison Adeline Alana Alice Alina Allison Amara Amelia Analise Andrea Angela Annika Arabella Aria Ariana Audrey Aurora Ava Avery Beatrice Bethany Bianca Brielle Brooklyn Bryn ' +
  'Camille Carmen Cassidy Cecilia Celia Charlotte Chloe Claire Clara Colette Cora Cordelia Daphne Delilah Eden Edith Eleanor Eliana Elise Ella Ellie Eloise Elsa Emerson Emery Emilia Esme Eva Evangeline ' +
  'Fiona Florence Frances Freya Gemma Genevieve Georgia Gia Gianna Gwendolyn Hadley Hallie Hannah Harper Hattie Hazel Heidi Imogen Ingrid Isabelle Iris Ivy Jada Jasmine Jemima Jocelyn Josie Joyce Julia Juliet ' +
  'June Kaia Kara Katelyn Kinsley Lacey Laila Lana Laurel Layla Leah Leila Lena Lillian Lola Lucia Luna Lydia Mabel Maddie Maeve Maisie Marlowe Mavis Maya Melody Mercy Mila Millie Mina Miriam Nadia Nell ' +
  'Nova Octavia Odessa Olive Opal Paige Paisley Penelope Petra Phoebe Piper Poppy Quinn Rachel Raina Rebecca Reese Rhea Rosalind Rowan Sabrina Sadie Sage Saoirse Selene Serena Simone Sloane Sophie Stella ' +
  'Sylvia Talia Tessa Thea Tilly Trinity Una Valerie Vera Violet Vivian Willa Winnie Xena Yara Zaria Zelda Zora').split(/\s+/);
const boys = ('Aaron Adrian Alden Alec Alexander Alistair Amos Anders Andre Angus Anson Archer Arlo Asher Atticus August Austin Axel Barrett Beau Beckett Bennett Benson Bishop Blaine Bodhi Boone Brady Bram ' +
  'Brantley Brock Bryce Callum Calvin Camden Carter Cassius Cedric Chase Clark Clay Clyde Cohen Colby Colton Conrad Corbin Cormac Crispin Dalton Damian Dane Darius Dawson Declan Dexter Dominic Drake Dustin ' +
  'Easton Eddie Edmund Elias Ellis Emmett Enzo Everett Ezra Fabian Finley Flynn Forrest Gage Gideon Graham Grant Gregory Griffin Gunnar Harlan Harvey Hayes Hendrix Holden Hugo Hunter Ian Isaac Ivan Jace ' +
  'Jasper Jedidiah Jensen Jonas Jude Julian Kai Keaton Kellen Kendrick Kingston Knox Lachlan Landon Lawson Leif Lennox Leo Levi Lincoln Logan Lucian Magnus Malcolm Marcus Maxwell Milo Monroe Nash Nathaniel ' +
  'Nico Nolan Oakley Orion Osborn Otis Owen Pascal Phineas Porter Preston Quentin Rafferty Ramsey Reid Remy Rhett Roman Roscoe Rory Ryder Sawyer Silas Spencer Stellan Sterling Tate Thaddeus Tobias Tucker ' +
  'Ulysses Vance Victor Wade Warren Weston Wilder Winston Wyatt Xavier Yosef Zane Zeke').split(/\s+/);
const surnames = ('Abbott Ackerman Adler Albright Alcott Ames Archer Ashby Atwood Avery Bagley Bancroft Barlow Barnett Barrow Bassett Baxter Beaumont Bellamy Benning Beresford Birch Blackwood Blevins Bolton Boyer ' +
  'Bradshaw Brannigan Brewster Briggs Brockway Brooks Buckley Burch Burnett Byers Caldwell Callahan Cameron Carlisle Carmichael Carver Cassidy Chambers Chandler Chapin Chatham Clayton Clifton Coburn Colby ' +
  'Conway Cooper Corbett Cranston Crawley Crosby Cullen Cushing Dalton Danforth Darby Davenport Dawes Delaney Denning Dickens Dillard Donovan Doyle Drummond Dunmore Durant Eastman Eaton Edison Ellison Emerson ' +
  'Everly Fairchild Farrow Fenton Ferris Fielding Finch Fitzgerald Fleming Fletcher Forbes Foster Fowler Franklin Frazier Fulton Gaines Galloway Gardner Garrison Gentry Gibbons Gilbert Gladstone Goodwin ' +
  'Gorman Granger Grayson Greer Gresham Griffith Gunther Hadley Hale Halloran Hamilton Hammond Hanley Hardin Harlow Harmon Harrington Hartley Hastings Hatfield Hawkins Hayward Heath Hendricks Hewitt Hilliard ' +
  'Hobbs Hodges Holbrook Holloway Hooper Hopkins Horton Houston Hubbard Hudson Huffman Hutchins Ingram Irving Jarvis Jeffries Jenkins Kendall Kensington Kerr Kimball Kingsley Kirkland Knight Lambert Landry ' +
  'Langley Larkin Latham Lawton Leland Lennox Lockhart Lombard Lowell Lyman Mabry Maddox Mallory Manning Marlow Marsden Mathis Maxwell Mayfield McAllister McCoy McKinley McLain Mercer Merrill Middleton ' +
  'Milford Monroe Montgomery Morrow Mortimer Nash Newbury Nolan Norwood Oakley Osgood Overton Pelham Pembroke Perkins Pierce Pinkerton Prescott Preston Pruitt Quincy Radcliffe Ramsey Rawlings Redding ' +
  'Reeves Rhodes Richland Ridley Rigby Rockwell Rowland Rutledge Sanborn Sawyer Seymour Shelby Sheridan Sherwood Slater Sloan Spalding Stafford Stanton Sterling Stillwell Stockton Sutton Swanson Talbot ' +
  'Tanner Tarleton Tate Thatcher Thornton Tilden Tolliver Townsend Tremaine Truman Tucker Tyler Underhill Upton Vance Vaughn Wadsworth Wagner Walden Wallace Warwick Waverly Wellington Wendell Westbrook ' +
  'Wheeler Whitaker Whitlock Whitney Wickham Wilder Winslow Winters Woodard Woodward Wright Wyatt Yates Yarborough York Zimmer').split(/\s+/);
module.exports = { girls: [...new Set(girls)], boys: [...new Set(boys)], surnames: [...new Set(surnames)] };
