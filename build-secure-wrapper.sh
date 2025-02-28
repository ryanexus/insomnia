VERSION=$(jq .version ./packages/insomnia/package.json -rj)
MAJOR=$(echo $VERSION | cut -d '.' -f 1)
MINOR=$(echo $VERSION | cut -d '.' -f 2)
PATCH=$(echo $VERSION | cut -d '.' -f 3 | cut -d '-' -f 1)
TAG=$(echo $VERSION | cut -d '-' -f 2)
SRC_DIR=packages/insomnia/src
CPP_DIR=$SRC_DIR/cpp
DEST_DIR=packages/insomnia/dist/win-unpacked

if [ -n "$TAG" ]; then
  TAG="-$TAG"
fi

npm run package:windows:unpacked -w insomnia

cp $DEST_DIR/Insomnia.exe $DEST_DIR/Insomnia.dll
cp $SRC_DIR/icons/icon.ico $CPP_DIR/insomnia.ico
sed "s/__MAJOR__/$MAJOR/g" $CPP_DIR/resources.rc > $CPP_DIR/final.rc
sed -i "s/__MINOR__/$MINOR/g" $CPP_DIR/final.rc
sed -i "s/__PATCH__/$PATCH/g" $CPP_DIR/final.rc
sed -i "s/__TAG__/$TAG/g" $CPP_DIR/final.rc
sed -i "s/__YEAR__/$(date +%Y)/g" $CPP_DIR/final.rc
windres $CPP_DIR/final.rc $CPP_DIR/res.o
g++ -lkernel32 -mwindows -c $CPP_DIR/insomnia.cpp -o $CPP_DIR/insomnia.o
g++ -O2 -mwindows $CPP_DIR/insomnia.o $CPP_DIR/res.o -o $DEST_DIR/Insomnia.exe
