# Lodi Adventures

A private photo archive. One owner keeps albums of photos, and guests look at the albums the owner has not made private.

## Language

### People

**Owner**:
The one person who keeps the archive and the only one who can change it.
_Avoid_: Admin, user, author

**Guest**:
Someone who has entered the guest password. A guest only reads, and only public albums.
_Avoid_: Visitor, viewer, public user

**Stranger**:
Anyone who is neither the owner nor a guest. A stranger sees the gate and nothing else.
_Avoid_: Visitor, anonymous user, public

### Content

**Album**:
A titled set of photos from one event, with a cover, a date and a description.
_Avoid_: Gallery, collection, set

**Featured album**:
The album the owner picks to open the home page. At most one album is featured.
_Avoid_: Hero album, pinned album, highlighted album

**Photo**:
One image in an album, with a title and the owner's note.
_Avoid_: Picture, image, asset

**Photo order**:
The order an album shows its photos in, reading roughly left to right, then down. New photos go at the end in the order the owner added them to the upload, and the owner can drag photos to change it.
_Avoid_: Sort order, sequence

**All Photos**:
Every photo from the albums the viewer can see, on the home page. The newest album comes first, and each album keeps its photo order.
_Avoid_: Feed, stream, timeline

**Cover**:
The image an album shows on its card and in its opening hero. Cloudinary crops it around its subject to fit each frame.
_Avoid_: Thumbnail, banner

**Note**:
The owner's text about one photo. Guests can read it, and only the owner writes it.
_Avoid_: Caption, comment, description

**Lightbox**:
The full-size view of one photo with its note, where the owner or a guest steps through an album's photos.
_Avoid_: Photo detail, modal

**Private album**:
An album only the owner can see. Every new album starts private.
_Avoid_: Hidden album, draft

**Public album**:
An album guests can see, once they are past the gate.
_Avoid_: Shared album, published album

**Portrait photo**:
A photo taller than it is wide.
_Avoid_: Vertical photo

**Landscape photo**:
A photo wider than it is tall.
_Avoid_: Horizontal photo

### Access

**Gate**:
The check in front of every page that asks for the guest password. It keeps strangers out of public albums.
_Avoid_: Lock, login, guest login

**Guest password**:
The one password the owner gives to everyone they want as a guest. Changing it ends every guest's access.
_Avoid_: Gate password, access code, shared password
