@echo off
set VER=1.3.8

sed -i -E "s/version>.+?</version>%VER%</" install.rdf
sed -i -E "s/version>.+?</version>%VER%</; s/download\/.+?\/modhresponse-.+?\.xpi/download\/%VER%\/modhresponse-%VER%\.xpi/" update.xml

set XPI=modhresponse-%VER%.xpi
if exist %XPI% del %XPI%
zip -r9q %XPI% * -x .git/* .gitignore update.xml LICENSE README.md *.cmd *.xpi *.exe
